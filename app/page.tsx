'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { type Entry, type Journal, type Profile, type Recommendation, addDays, dateKey, defaultProfile, monday, parseDate, recommend, weekly } from '@/lib/journal';
import { ApiError, api } from '@/lib/api';
import { isoWeek, weekRange } from '@/lib/format';
import { AccountForm, AuthLayout, ForgotPasswordForm, ProfileSetup, ResetPasswordForm, type AccountDetails } from '@/components/account-flow';
import { AppHeader } from '@/components/app-header';
import { ClearJournalDialog, LogDialog, ProfileDialog, TargetDialog } from '@/components/dialogs';
import { DayRows, EarlierWeeks, WeekFigures } from '@/components/journal';
import { WeightChart } from '@/components/weight-chart';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';

type Screen = 'loading' | 'login' | 'signup' | 'forgot' | 'reset' | 'onboarding' | 'dashboard' | 'service-error';
type Panel = 'profile' | 'target' | 'clear' | null;

const goalText = (profile: Profile) => profile.goal === 'maintain'
  ? 'Goal: keep your weight steady'
  : `Goal: ${profile.goal} ${profile.pace} kg a week`;

export default function Home() {
  const [today, setToday] = useState('2026-10-01');
  const [journal, setJournal] = useState<Journal>({ profile: null, entries: [] });
  const [screen, setScreen] = useState<Screen>('loading');
  const [sessionVersion, setSessionVersion] = useState(0);
  const [resetToken, setResetToken] = useState('');
  const [logDate, setLogDate] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remoteRecommendation, setRemoteRecommendation] = useState<Recommendation | null>(null);
  const profile: Profile = { ...defaultProfile, ...journal.profile, name: journal.account_name ?? journal.profile?.name ?? '' };

  useEffect(() => {
    // Password reset links carry the token in the URL fragment; take it and remove it from the address bar and history.
    // Listening for hashchange covers links opened in a tab where Tally is already loaded.
    function takeResetToken() {
      const resetLink = /^#reset=([\w-]{20,200})$/.exec(window.location.hash);
      if (resetLink) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        setError('');
        setResetToken(resetLink[1]);
      }
    }
    takeResetToken();
    window.addEventListener('hashchange', takeResetToken);
    return () => window.removeEventListener('hashchange', takeResetToken);
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the date is only known in the browser, after hydration.
    setToday(dateKey(new Date()));
    if (resetToken) { setScreen('reset'); return; }
    setScreen('loading');
    setError('');
    async function restoreSession() {
      try {
        const config = await api<{ connected: boolean }>('config');
        if (!config.connected) throw new Error('Sign-in is temporarily unavailable. Please try again shortly.');
        const data = await api<Journal>('journal');
        if (!active) return;
        setJournal(data);
        setScreen(data.profile ? 'dashboard' : 'onboarding');
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) { setJournal({ profile: null, entries: [] }); setScreen('login'); }
        else { setError(e instanceof Error ? e.message : 'Could not connect. Please try again.'); setScreen('service-error'); }
      }
    }
    void restoreSession();
    return () => { active = false; };
  }, [sessionVersion, resetToken]);

  const thisWeek = monday(today);
  const current = weekly(journal.entries, thisWeek), previous = weekly(journal.entries, addDays(thisWeek, -7));
  const localRecommendation = recommend(profile, journal.entries, thisWeek);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- drop the previous estimate as soon as its inputs change.
    setRemoteRecommendation(null);
    if (screen === 'dashboard' && journal.profile) {
      api<Recommendation>(`recommendation?before=${monday(today)}`).then(data => { if (active) setRemoteRecommendation(data); }).catch(() => {});
    }
    return () => { active = false; };
  }, [journal, screen, today]);
  const recommendation = remoteRecommendation ?? localRecommendation;

  const saveEntry = useCallback(async (entry: Entry) => {
    if (screen !== 'dashboard') throw new Error('Sign in and complete your profile first.');
    if (entry.date > dateKey(new Date())) throw new Error('Choose today or an earlier day.');
    if (entry.weight !== null && (!Number.isFinite(entry.weight) || entry.weight < 25 || entry.weight > 350)) throw new Error('Enter a weight between 25 and 350 kg.');
    if (entry.calories !== null && (!Number.isInteger(entry.calories) || entry.calories < 0 || entry.calories > 15000)) throw new Error('Enter whole calories between 0 and 15,000.');
    if (entry.steps != null && (!Number.isInteger(entry.steps) || entry.steps < 0 || entry.steps > 100000)) throw new Error('Enter whole steps between 0 and 100,000.');
    if (entry.sport_type !== undefined) {
      const sport = entry.sport_type, minutes = entry.activity_minutes;
      const timed = sport !== null && sport !== 'none';
      if ((sport === null && minutes !== null) || (sport === 'none' && minutes !== 0) || (timed && (!Number.isInteger(minutes) || minutes == null || minutes < 1 || minutes > 600))) {
        throw new Error('Choose an activity and 1–600 minutes, or mark a rest day.');
      }
    }
    const saved = { ...journal.entries.find(e => e.date === entry.date), ...entry };
    await api(`entries/${entry.date}`, 'PUT', saved);
    setJournal(j => ({ ...j, entries: [...j.entries.filter(e => e.date !== entry.date), saved].sort((a, b) => a.date.localeCompare(b.date)) }));
    return { saved: true, date: entry.date };
  }, [journal.entries, screen]);

  // Browser WebMCP tools: read the journal and save a daily log for the signed-in account.
  const toolState = useRef({ journal, recommendation, saveEntry });
  useEffect(() => { toolState.current = { journal, recommendation, saveEntry }; });
  useEffect(() => {
    if (screen !== 'dashboard') return;
    const context = (document as Document & { modelContext?: { registerTool: (t: unknown, o: unknown) => Promise<void> | void } }).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    const tools = [{
      name: 'read_weekly_journal', title: 'Read weekly journal',
      description: 'Read the signed-in profile, daily entries, and current calorie estimate.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true },
      execute: () => ({ mode: 'account', journal: toolState.current.journal, recommendation: toolState.current.recommendation }),
    }, {
      name: 'save_daily_log', title: 'Save daily log',
      description: 'Save weight, calories, and optional steps for one day in the signed-in journal.',
      inputSchema: { type: 'object', properties: { date: { type: 'string', format: 'date' }, weight: { type: ['number', 'null'] }, calories: { type: ['integer', 'null'] }, steps: { type: ['integer', 'null'] } }, required: ['date', 'weight', 'calories'], additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute: async (input: unknown) => {
        const e = input as Entry;
        if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || dateKey(parseDate(e.date)) !== e.date || !('weight' in e) || !('calories' in e)) throw new Error('Invalid daily log.');
        return toolState.current.saveEntry(e);
      },
    }];
    for (const t of tools) try { void Promise.resolve(context.registerTool(t, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    return () => lifecycle.abort();
  }, [screen]);

  async function run(action: () => Promise<void>, onError?: () => void) {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (e) { setError((e as Error).message); onError?.(); }
    finally { setBusy(false); }
  }

  const openLog = (date: string) => { setError(''); setLogDate(date); };
  const openPanel = (next: Panel) => { setError(''); setPanel(next); };
  const navigateAuth = (next: Screen) => { setError(''); setScreen(next); };

  const submitLog = (entry: Entry) => run(async () => {
    await saveEntry(entry);
    setLogDate(null);
    toast.success('Saved');
  });

  const persistProfile = (next: Profile) => run(async () => {
    const saved = await api<Profile>('profile', 'PUT', next);
    setJournal(j => ({ ...j, profile: saved, account_name: saved.name }));
    setPanel(null);
    setScreen('dashboard');
    toast.success('Profile saved');
  });

  const submitAuth = (details: AccountDetails, kind: 'login' | 'signup') => run(async () => {
    const result = await api<{ name: string }>(`auth/${kind}`, 'POST', details);
    const data = await api<Journal>('journal');
    setJournal({ ...data, account_name: data.account_name ?? result.name });
    setScreen(data.profile ? 'dashboard' : 'onboarding');
  });

  async function requestPasswordReset(email: string) {
    let sent = false;
    await run(async () => { await api('auth/forgot-password', 'POST', { email }); sent = true; });
    return sent;
  }

  // Clearing the token reloads the now signed-in session.
  const saveNewPassword = (password: string, confirmation: string) => run(async () => {
    await api('auth/reset-password', 'POST', { token: resetToken, password, confirm_password: confirmation });
    setResetToken('');
    toast.success('Your password has been updated');
  });

  const signOut = () => run(async () => {
    await api('auth/logout', 'POST', {});
    setJournal({ profile: null, entries: [] });
    setRemoteRecommendation(null);
    setLogDate(null);
    setPanel(null);
    setScreen('login');
  }, () => toast.error('Could not sign out. Try again.'));

  const clearJournal = () => run(async () => {
    await api('entries', 'DELETE', { confirm: true });
    setJournal(j => ({ ...j, entries: [] }));
    setRemoteRecommendation(null);
    setPanel(null);
    toast.success('Journal cleared');
  });

  const toaster = <Toaster position="bottom-center" toastOptions={{ className: 'toast' }} />;

  if (screen === 'loading') return <div className="loading">
    {toaster}
    <Wordmark />
    <p className="quiet" role="status">Loading your journal…</p>
  </div>;

  if (screen !== 'dashboard') {
    const onHome = busy ? undefined
      : screen === 'signup' || screen === 'forgot' ? () => navigateAuth('login')
      : screen === 'reset' ? () => setResetToken('')
      : undefined;
    return <AuthLayout today={today} onHome={onHome}>
      {toaster}
      {screen === 'service-error' ? <>
        <h1>Tally can’t reach its server</h1>
        <p role="alert" className="lede">{error}</p>
        <Button className="auth-button" onClick={() => setSessionVersion(v => v + 1)}>Try again</Button>
      </> : null}
      {screen === 'login' || screen === 'signup'
        ? <AccountForm key={screen} kind={screen} busy={busy} error={error}
            onSwitch={() => navigateAuth(screen === 'login' ? 'signup' : 'login')} onForgot={() => navigateAuth('forgot')}
            onSubmit={details => submitAuth(details, screen)} />
        : null}
      {screen === 'forgot' ? <ForgotPasswordForm busy={busy} error={error} onBack={() => navigateAuth('login')} onSubmit={requestPasswordReset} /> : null}
      {screen === 'reset' ? <ResetPasswordForm busy={busy} error={error} onCancel={() => setResetToken('')} onSubmit={saveNewPassword} /> : null}
      {screen === 'onboarding' ? <ProfileSetup name={journal.account_name ?? ''} busy={busy} error={error} onSubmit={persistProfile} onSignOut={signOut} /> : null}
    </AuthLayout>;
  }

  return <div className="app">
    {toaster}
    <AppHeader name={profile.name} busy={busy} onLog={() => openLog(today)}
      onProfile={() => openPanel('profile')} onClear={() => openPanel('clear')} onSignOut={signOut} />
    <div className="page">
      <section className="masthead">
        <h1>{weekRange(thisWeek, addDays(thisWeek, 6))}</h1>
        <p>Week {isoWeek(thisWeek)}</p>
      </section>

      <div className="dashboard">
        <main className="dashboard-main">
          <section className="section">
            <h2 className="section-title">Weight, last eight weeks</h2>
            <div className="panel panel-chart"><WeightChart entries={journal.entries} today={today} profile={profile} /></div>
          </section>

          <section className="section">
            <h2 className="section-title">This week</h2>
            <div className="panel"><DayRows start={thisWeek} entries={journal.entries} today={today} onEdit={openLog} /></div>
          </section>

          <section className="section">
            <h2 className="section-title">Earlier weeks</h2>
            <div className="panel"><EarlierWeeks entries={journal.entries} today={today} onEdit={openLog}
              targetFor={start => recommend(profile, journal.entries, start)} /></div>
          </section>
        </main>

        <aside className="rail" aria-label="This week’s figures">
          <div className="panel">
            <WeekFigures current={current} previous={previous} recommendation={recommendation} onExplain={() => openPanel('target')} />
            <p className="rail-goal">{goalText(profile)}<button type="button" className="text-link" onClick={() => openPanel('profile')}>Change</button></p>
          </div>
        </aside>
      </div>
    </div>

    {logDate ? <LogDialog key={logDate} date={logDate} entry={journal.entries.find(e => e.date === logDate)} busy={busy} error={error}
      onSave={submitLog} onClose={() => setLogDate(null)} /> : null}
    {panel === 'profile' ? <ProfileDialog profile={profile} busy={busy} error={error} onSave={persistProfile} onClose={() => setPanel(null)} /> : null}
    {panel === 'target' ? <TargetDialog recommendation={recommendation} baseline={profile.baseline_calories} onClose={() => setPanel(null)} /> : null}
    <ClearJournalDialog open={panel === 'clear'} busy={busy} error={error} onConfirm={clearJournal} onOpenChange={open => setPanel(open ? 'clear' : null)} />
  </div>;
}
