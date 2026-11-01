'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { type Entry, type Profile, type Recommendation, type SportType } from '@/lib/journal';
import { SPORTS, fmt, longDate } from '@/lib/format';

export function Field({ label, unit, hint, children }: { label: string; unit?: string; hint?: string; children: ReactNode }) {
  return <label className="field">
    <span className="field-label">{label}{unit ? <span className="field-unit">{unit}</span> : null}</span>
    {children}
    {hint ? <span className="field-hint">{hint}</span> : null}
  </label>;
}

/** A password input with a button that shows or hides what is typed. */
export function PasswordInput({ name, autoComplete, minLength, maxLength = 128 }: {
  name: string; autoComplete: 'current-password' | 'new-password'; minLength: number; maxLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return <span className="password">
    <Input name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} minLength={minLength} maxLength={maxLength}
      required autoCapitalize="none" autoCorrect="off" spellCheck={false} />
    <button type="button" className="password-toggle" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}
      onClick={() => setVisible(v => !v)}>
      {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
    </button>
  </span>;
}

export function Choice<T extends string>({ legend, name, value, options, onChange }: {
  legend: string; name: string; value: T | null; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <fieldset className="choice">
    <legend className="field-label">{legend}</legend>
    <div className="choice-options">
      {options.map(option => <label key={option.value}>
        <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} required />
        <span>{option.label}</span>
      </label>)}
    </div>
  </fieldset>;
}

export function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <Button type="submit" disabled={busy}>
    {busy ? <Loader2 className="spin" aria-hidden="true" /> : null}{busy ? 'Saving…' : children}
  </Button>;
}

export const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] as const;
const GOALS = [{ value: 'lose', label: 'Lose' }, { value: 'maintain', label: 'Maintain' }, { value: 'gain', label: 'Gain' }] as const;

type SportChoice = SportType | 'unreported';

/** Empty inputs mean "not logged". */
const optionalNumber = (value: string) => value === '' ? null : Number(value);

export function LogDialog({ date, entry, busy, error, onSave, onClose }: {
  date: string; entry: Entry | undefined; busy: boolean; error: string;
  onSave: (entry: Entry) => Promise<void>; onClose: () => void;
}) {
  const [weight, setWeight] = useState(entry?.weight?.toString() ?? '');
  const [calories, setCalories] = useState(entry?.calories?.toString() ?? '');
  const [steps, setSteps] = useState(entry?.steps?.toString() ?? '');
  const [sport, setSport] = useState<SportChoice>(entry?.sport_type ?? 'unreported');
  const [minutes, setMinutes] = useState(entry?.activity_minutes ? entry.activity_minutes.toString() : '');
  const timed = sport !== 'unreported' && sport !== 'none';

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave({
      date, weight: optionalNumber(weight), calories: optionalNumber(calories), steps: optionalNumber(steps),
      sport_type: sport === 'unreported' ? null : sport,
      activity_minutes: sport === 'unreported' ? null : sport === 'none' ? 0 : optionalNumber(minutes),
    });
  }

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="sheet sheet-narrow">
      <DialogTitle className="sheet-title">{longDate(date)}</DialogTitle>
      <DialogDescription className="sheet-lede">Fill in what you have. Empty fields are left out of your averages.</DialogDescription>
      <form onSubmit={submit} className="form">
        <div className="form-row">
          <Field label="Weight" unit="kg"><Input autoFocus type="number" inputMode="decimal" min="25" max="350" step="0.1" placeholder="72.4" value={weight} onChange={e => setWeight(e.target.value)} /></Field>
          <Field label="Calories" unit="kcal"><Input type="number" inputMode="numeric" min="0" max="15000" step="1" placeholder="2500" value={calories} onChange={e => setCalories(e.target.value)} /></Field>
        </div>
        <div className="form-row">
          <Field label="Steps"><Input type="number" inputMode="numeric" min="0" max="100000" step="1" placeholder="8000" value={steps} onChange={e => setSteps(e.target.value)} /></Field>
          <Field label="Activity">
            <NativeSelect value={sport} onChange={e => { setSport(e.target.value as SportChoice); setMinutes(''); }}>
              <NativeSelectOption value="unreported">Not logged</NativeSelectOption>
              {SPORTS.map(s => <NativeSelectOption key={s.value} value={s.value}>{s.label}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
        </div>
        {timed ? <Field label="Duration" unit="minutes"><Input required type="number" inputMode="numeric" min="1" max="600" step="1" placeholder="45" value={minutes} onChange={e => setMinutes(e.target.value)} /></Field> : null}
        {error ? <p role="alert" className="form-error">{error}</p> : null}
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Submit busy={busy}>Save</Submit>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function ProfileDialog({ profile, busy, error, onSave, onClose }: {
  profile: Profile; busy: boolean; error: string; onSave: (profile: Profile) => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Profile>({ ...profile });
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setDraft(d => ({ ...d, [key]: value }));
  // Required measurements may be empty while editing; the browser blocks saving until they are filled in.
  const measurement = (value: string) => optionalNumber(value) as number;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="sheet">
      <DialogTitle className="sheet-title">Profile and goals</DialogTitle>
      <DialogDescription className="sheet-lede">Your starting target is the calorie intake you plan to follow. Tally only adjusts it once your own logs support a change.</DialogDescription>
      <form className="form" onSubmit={e => { e.preventDefault(); void onSave(draft); }}>
        <section className="form-section">
          <h3>You</h3>
          <Field label="Name"><Input required maxLength={80} value={draft.name} onChange={e => set('name', e.target.value)} /></Field>
          <div className="form-row form-row-4">
            <Field label="Height" unit="cm"><Input required type="number" min="100" max="250" step="1" value={draft.height_cm ?? ''} onChange={e => set('height_cm', measurement(e.target.value))} /></Field>
            <Field label="Age"><Input required type="number" min="18" max="100" step="1" value={draft.age ?? ''} onChange={e => set('age', measurement(e.target.value))} /></Field>
            <Field label="Start weight" unit="kg"><Input required type="number" min="25" max="350" step="0.1" value={draft.weight_kg ?? ''} onChange={e => set('weight_kg', measurement(e.target.value))} /></Field>
            <Field label="Body fat" unit="%"><Input type="number" min="3" max="65" step="0.1" placeholder="Optional" value={draft.body_fat ?? ''} onChange={e => set('body_fat', optionalNumber(e.target.value))} /></Field>
          </div>
          <div className="form-row">
            <Choice legend="Hard for you to gain weight?" name="difficulty_gain" value={draft.difficulty_gain ? 'yes' : 'no'} options={YES_NO} onChange={v => set('difficulty_gain', v === 'yes')} />
            <Choice legend="Hard for you to lose weight?" name="difficulty_lose" value={draft.difficulty_lose ? 'yes' : 'no'} options={YES_NO} onChange={v => set('difficulty_lose', v === 'yes')} />
          </div>
        </section>
        <section className="form-section">
          <h3>Usual routine</h3>
          <div className="form-row">
            <Field label="Main activity">
              <NativeSelect value={draft.activity_type} onChange={e => {
                const type = e.target.value as SportType;
                setDraft(d => ({ ...d, activity_type: type, activity_sessions_per_week: type === 'none' ? 0 : d.activity_sessions_per_week || 3 }));
              }}>
                <NativeSelectOption value="none">No regular activity</NativeSelectOption>
                {SPORTS.filter(s => s.value !== 'none').map(s => <NativeSelectOption key={s.value} value={s.value}>{s.label}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <Field label="Sessions a week"><Input type="number" min="1" max="7" step="1" required={draft.activity_type !== 'none'} disabled={draft.activity_type === 'none'} value={draft.activity_sessions_per_week || ''} onChange={e => set('activity_sessions_per_week', Number(e.target.value))} /></Field>
          </div>
        </section>
        <section className="form-section">
          <h3>Goal</h3>
          <Choice legend="Weight" name="goal" value={draft.goal} options={GOALS} onChange={v => set('goal', v)} />
          <div className="form-row">
            {draft.goal !== 'maintain'
              ? <Field label="Pace" unit="kg / week"><Input required type="number" min="0.05" max="0.5" step="0.05" value={draft.pace} onChange={e => set('pace', Number(e.target.value))} /></Field>
              : null}
            <Field label="Starting target" unit="kcal / day"><Input required type="number" min="1500" max="4500" step="25" value={draft.baseline_calories} onChange={e => set('baseline_calories', Number(e.target.value))} /></Field>
          </div>
        </section>
        {error ? <p role="alert" className="form-error">{error}</p> : null}
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Submit busy={busy}>Save changes</Submit>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function TargetDialog({ recommendation, baseline, onClose }: {
  recommendation: Recommendation; baseline: number; onClose: () => void;
}) {
  const features = recommendation.model_features;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="sheet sheet-narrow">
      <DialogTitle className="sheet-title">How your target is set</DialogTitle>
      <DialogDescription className="sheet-lede">{recommendation.reason}</DialogDescription>
      <dl className="target-compare">
        <div><dt>Starting target</dt><dd>{fmt(baseline)} <small>kcal</small></dd></div>
        <div><dt>This week</dt><dd>{fmt(recommendation.target)} <small>kcal</small></dd></div>
        <div><dt>Weeks of data</dt><dd>{recommendation.samples} <small>{recommendation.samples < 6 ? 'of 6 needed' : 'used'}</small></dd></div>
      </dl>
      <ol className="steps">
        <li><b>Enough history.</b> A week counts when it has at least five weigh-ins and five calorie logs. Six such week-to-week changes are needed.</li>
        <li><b>A pattern that holds.</b> Tally fits how your weekly weight changed against what you ate, and checks it on the two most recent weeks. Steps and sport are used only if they make those predictions better.</li>
        <li><b>Small steps.</b> The target never moves more than 100 kcal from your starting target, and nothing changes in your plan unless you change it.</li>
      </ol>
      <p className="fine-print">
        An experimental estimate from your own logs, not nutrition advice.{' '}
        {features && features !== 'calories'
          ? `It assumes your latest ${features === 'calories_sport_steps' ? 'step and sport' : features === 'calories_and_steps' ? 'step' : 'sport'} routine continues.`
          : 'Steps and sport are recorded but don’t affect it yet.'}{' '}
        Water, illness and missing days can throw it off.{' '}
        <a href="https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner" target="_blank" rel="noreferrer">About weight planning (NIDDK)</a>
      </p>
    </DialogContent>
  </Dialog>;
}

export function ClearJournalDialog({ open, busy, error, onConfirm, onOpenChange }: {
  open: boolean; busy: boolean; error: string; onConfirm: () => void; onOpenChange: (open: boolean) => void;
}) {
  return <AlertDialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
    <AlertDialogContent className="sheet sheet-narrow">
      <AlertDialogTitle className="sheet-title">Clear your journal?</AlertDialogTitle>
      <AlertDialogDescription className="sheet-lede">Every daily entry is deleted for good: weight, calories, steps and activity. Your profile and goals are kept.</AlertDialogDescription>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <div className="form-actions">
        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" className="danger-action" disabled={busy} onClick={event => { event.preventDefault(); onConfirm(); }}>
          {busy ? 'Clearing…' : 'Delete all entries'}
        </AlertDialogAction>
      </div>
    </AlertDialogContent>
  </AlertDialog>;
}
