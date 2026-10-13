'use client';

import { useState, type FormEvent } from 'react';
import { Activity, ArrowLeft, ArrowRight, Check, Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { defaultProfile, type Profile } from '@/lib/journal';

export type AccountDetails = { name?: string; email: string; password: string; confirm_password?: string };

export function TallyBrand() {
  return <span className="brand"><span className="brand-symbol"><Activity size={22} strokeWidth={2.4} /></span>tally<span className="brand-period">.</span></span>;
}

export function WelcomeScreen({ onChoose }: { onChoose: (screen: 'login' | 'signup') => void }) {
  return <main className="auth-shell welcome-shell">
    <div className="welcome-card">
      <TallyBrand />
      <h1>Welcome to Tally<span>.</span></h1>
      <p>Your journal. Your progress.</p>
      <div className="welcome-actions">
        <Button onClick={() => onChoose('login')}>Sign in <ArrowRight size={18} /></Button>
        <Button variant="outline" onClick={() => onChoose('signup')}>Create an account</Button>
      </div>
    </div>
  </main>;
}

export function AccountForm({ kind, busy, error, onBack, onSwitch, onForgot, onSubmit }: {
  kind: 'login' | 'signup'; busy: boolean; error: string;
  onBack: () => void; onSwitch: () => void; onForgot: () => void;
  onSubmit: (details: AccountDetails) => Promise<void>;
}) {
  const [validationError, setValidationError] = useState('');
  const signup = kind === 'signup';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmation = String(form.get('confirm_password') ?? '');
    const name = String(form.get('name') ?? '').trim();
    if (signup && !name) { setValidationError('Enter your name.'); return; }
    if (signup && password !== confirmation) { setValidationError('Passwords do not match.'); return; }
    setValidationError('');
    await onSubmit({ email: String(form.get('email')).trim(), password,
      ...(signup ? { name, confirm_password: confirmation } : {}) });
  }
  return <main className="auth-shell">
    <div className="auth-card">
      <Button variant="ghost" className="auth-back" disabled={busy} onClick={onBack}><ArrowLeft size={16} /> Back</Button>
      <TallyBrand />
      {signup ? <p className="setup-step">Step 1 of 2 · Your account</p> : null}
      <h1>{signup ? 'Make it your own.' : 'Welcome back.'}</h1>
      <p className="auth-description">{signup ? 'Create your account, then tell us a little about yourself.' : 'Sign in to open your journal.'}</p>
      <form onSubmit={submit} className="form-stack" onChange={() => setValidationError('')}>
        <fieldset disabled={busy} className="auth-fields">
          {signup ? <div className="field"><Label htmlFor="account-name">Name</Label><Input id="account-name" name="name" autoComplete="name" placeholder="Your name" required maxLength={80} /></div> : null}
          <div className="field"><Label htmlFor="account-email">Email address</Label><Input id="account-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div>
          <div className="field"><Label htmlFor="account-password">Password</Label><Input id="account-password" name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'At least 10 characters' : 'Your password'} minLength={signup ? 10 : 1} maxLength={128} required /></div>
          {!signup ? <button type="button" className="forgot-link" onClick={onForgot}>Forgot password?</button> : null}
          {signup ? <div className="field"><Label htmlFor="account-confirm-password">Confirm password</Label><Input id="account-confirm-password" name="confirm_password" type="password" autoComplete="new-password" placeholder="Enter your password again" minLength={10} maxLength={128} required /></div> : null}
        </fieldset>
        {validationError || error ? <p role="alert" className="form-error">{validationError || error}</p> : null}
        <Button type="submit" className="full-button" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={17} /> : null}{busy ? 'Please wait…' : signup ? 'Continue' : 'Sign in'}{!busy ? <ArrowRight size={17} /> : null}</Button>
      </form>
      <p className="auth-switch">{signup ? 'Already have an account?' : 'New to Tally?'} <button type="button" disabled={busy} onClick={onSwitch}>{signup ? 'Sign in' : 'Create an account'}</button></p>
    </div>
  </main>;
}

export function ForgotPasswordForm({ busy, error, onBack, onSubmit }: {
  busy: boolean; error: string; onBack: () => void;
  onSubmit: (email: string) => Promise<boolean>;
}) {
  const [sentTo, setSentTo] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email')).trim();
    if (await onSubmit(email)) setSentTo(email);
  }
  return <main className="auth-shell">
    <div className="auth-card">
      <Button variant="ghost" className="auth-back" disabled={busy} onClick={onBack}><ArrowLeft size={16} /> Back to sign in</Button>
      <TallyBrand />
      {sentTo ? <>
        <h1>Check your inbox.</h1>
        <p className="auth-description">If an account exists for <strong>{sentTo}</strong>, we sent a link to reset your password. It expires in 30 minutes. Check your spam folder if it doesn’t arrive.</p>
        <p className="form-success" role="status"><MailCheck size={17} />Reset link requested</p>
        <Button className="full-button w-full" onClick={onBack}>Back to sign in</Button>
      </> : <>
        <h1>Forgot your password?</h1>
        <p className="auth-description">Enter your account email and we’ll send you a link to choose a new one.</p>
        <form onSubmit={submit} className="form-stack">
          <fieldset disabled={busy} className="auth-fields">
            <div className="field"><Label htmlFor="forgot-email">Email address</Label><Input id="forgot-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div>
          </fieldset>
          {error ? <p role="alert" className="form-error">{error}</p> : null}
          <Button type="submit" className="full-button" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={17} /> : null}{busy ? 'Please wait…' : 'Send reset link'}{!busy ? <ArrowRight size={17} /> : null}</Button>
        </form>
      </>}
    </div>
  </main>;
}

export function ResetPasswordForm({ busy, error, onCancel, onSubmit }: {
  busy: boolean; error: string; onCancel: () => void;
  onSubmit: (password: string, confirmation: string) => Promise<void>;
}) {
  const [validationError, setValidationError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? ''), confirmation = String(form.get('confirm_password') ?? '');
    if (password !== confirmation) { setValidationError('Passwords do not match.'); return; }
    setValidationError('');
    await onSubmit(password, confirmation);
  }
  return <main className="auth-shell">
    <div className="auth-card">
      <TallyBrand />
      <h1>Choose a new password.</h1>
      <p className="auth-description">You’ll be signed in, and signed out on your other devices.</p>
      <form onSubmit={submit} className="form-stack" onChange={() => setValidationError('')}>
        <fieldset disabled={busy} className="auth-fields">
          <div className="field"><Label htmlFor="reset-password">New password</Label><Input id="reset-password" name="password" type="password" autoComplete="new-password" placeholder="At least 10 characters" minLength={10} maxLength={128} required /></div>
          <div className="field"><Label htmlFor="reset-confirm-password">Confirm new password</Label><Input id="reset-confirm-password" name="confirm_password" type="password" autoComplete="new-password" placeholder="Enter it again" minLength={10} maxLength={128} required /></div>
        </fieldset>
        {validationError || error ? <p role="alert" className="form-error">{validationError || error}</p> : null}
        <Button type="submit" className="full-button" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />}{busy ? 'Please wait…' : 'Save new password'}</Button>
      </form>
      <button type="button" className="setup-signout" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </main>;
}

export function ProfileSetup({ name, busy, error, onSubmit, onSignOut }: {
  name: string; busy: boolean; error: string;
  onSubmit: (profile: Profile) => Promise<void>; onSignOut: () => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const bodyFat = String(values.get('body_fat') ?? '');
    await onSubmit({ ...defaultProfile, name, goal: 'maintain',
      height_cm: Number(values.get('height_cm')), age: Number(values.get('age')),
      weight_kg: Number(values.get('weight_kg')), body_fat: bodyFat === '' ? null : Number(bodyFat),
      difficulty_gain: values.get('difficulty_gain') === 'yes',
      difficulty_lose: values.get('difficulty_lose') === 'yes' });
  }
  return <main className="auth-shell">
    <div className="auth-card setup-card">
      <TallyBrand />
      <p className="setup-step">Step 2 of 2 · About you</p>
      <h1>A little about you.</h1>
      <p className="auth-description">Hi {name}. Complete your profile to open your dashboard.</p>
      <form onSubmit={submit} className="form-stack">
        <fieldset disabled={busy} className="auth-fields">
          <div className="form-grid">
            <div className="field"><Label htmlFor="setup-height">Height (cm)</Label><Input id="setup-height" name="height_cm" type="number" inputMode="decimal" min={100} max={250} step="0.1" required placeholder="e.g. 170" /></div>
            <div className="field"><Label htmlFor="setup-age">Age</Label><Input id="setup-age" name="age" type="number" inputMode="numeric" min={18} max={100} step="1" required placeholder="e.g. 25" /></div>
            <div className="field"><Label htmlFor="setup-weight">Weight (kg)</Label><Input id="setup-weight" name="weight_kg" type="number" inputMode="decimal" min={25} max={350} step="0.1" required placeholder="e.g. 68.4" /></div>
            <div className="field"><Label htmlFor="setup-body-fat">Body fat (%) · optional</Label><Input id="setup-body-fat" name="body_fat" type="number" inputMode="decimal" min={3} max={65} step="0.1" placeholder="Leave blank if unknown" /></div>
          </div>
          {(['gain', 'lose'] as const).map(direction => <fieldset key={direction} className="setup-question">
            <legend>Do you find it difficult to {direction} weight?</legend>
            <div className="yes-no-options">{['yes', 'no'].map(answer => <label key={answer}><input type="radio" name={`difficulty_${direction}`} value={answer} required /><span>{answer === 'yes' ? 'Yes' : 'No'}</span></label>)}</div>
          </fieldset>)}
        </fieldset>
        <p className="form-hint">You can set your activity, weight goal, and starting calorie target in Profile &amp; goals.</p>
        {error ? <p role="alert" className="form-error">{error}</p> : null}
        <Button type="submit" disabled={busy} className="full-button">{busy ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />}Open my dashboard</Button>
      </form>
      <button type="button" className="setup-signout" disabled={busy} onClick={onSignOut}>Sign out and finish later</button>
    </div>
  </main>;
}
