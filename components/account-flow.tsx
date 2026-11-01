'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { defaultProfile, sampleJournal, type Profile } from '@/lib/journal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Choice, Field, PasswordInput, Submit, YES_NO } from '@/components/dialogs';
import { WeightChart } from '@/components/weight-chart';
import { Wordmark } from '@/components/wordmark';

export type AccountDetails = { name?: string; email: string; password: string; confirm_password?: string };

/** Two panels on wide screens: what Tally is on the left, the current form on the right. */
export function AuthLayout({ today, children, onHome }: { today: string; children: ReactNode; onHome?: () => void }) {
  const sample = sampleJournal(today);
  return <div className="auth">
    <header className="auth-header"><Wordmark onClick={onHome} /></header>
    <section className="auth-pitch">
      <h2>A weekly record of your weight and what you eat.</h2>
      <p>Log your weight, calories, steps and training each day. Tally shows your weekly averages, plots the trend against your goal, and suggests a calorie target once it has enough of your own data to go on.</p>
      <figure className="auth-sample" aria-label="Example of a Tally weight chart with sample data" inert>
        <WeightChart entries={sample.entries} today={today} profile={sample.profile!} days={35} interactive={false} />
        <figcaption>Sample data</figcaption>
      </figure>
    </section>
    <main className="auth-main"><div className="auth-panel">{children}</div></main>
  </div>;
}

export function AccountForm({ kind, busy, error, onSwitch, onForgot, onSubmit }: {
  kind: 'login' | 'signup'; busy: boolean; error: string;
  onSwitch: () => void; onForgot: () => void;
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
    await onSubmit({ email: String(form.get('email')).trim(), password, ...(signup ? { name, confirm_password: confirmation } : {}) });
  }
  return <>
    {signup ? <p className="auth-step">Step 1 of 2</p> : null}
    <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
    <p className="lede">{signup ? 'Log your weight and calories each day and follow your weekly trend.' : 'Sign in to your journal.'}</p>
    <form onSubmit={submit} className="form" onChange={() => setValidationError('')}>
      <fieldset disabled={busy} className="form-fields">
        {signup ? <Field label="Name"><Input name="name" autoComplete="name" required maxLength={80} /></Field> : null}
        <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
        <div className="password-field">
          <Field label="Password" hint={signup ? 'At least 10 characters.' : undefined}>
            <PasswordInput name="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 10 : 1} />
          </Field>
          {!signup ? <button type="button" className="text-link forgot-link" onClick={onForgot}>Forgot password?</button> : null}
        </div>
        {signup ? <Field label="Confirm password"><PasswordInput name="confirm_password" autoComplete="new-password" minLength={10} /></Field> : null}
      </fieldset>
      {validationError || error ? <p role="alert" className="form-error">{validationError || error}</p> : null}
      <Submit busy={busy}>{signup ? 'Continue' : 'Sign in'}</Submit>
    </form>
    <p className="auth-links">
      {signup ? 'Already have an account?' : 'New to Tally?'}{' '}
      <button type="button" className="text-link" disabled={busy} onClick={onSwitch}>{signup ? 'Sign in' : 'Create an account'}</button>
    </p>
  </>;
}

export function ForgotPasswordForm({ busy, error, onBack, onSubmit }: {
  busy: boolean; error: string; onBack: () => void; onSubmit: (email: string) => Promise<boolean>;
}) {
  const [sentTo, setSentTo] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email')).trim();
    if (await onSubmit(email)) setSentTo(email);
  }
  return sentTo ? <>
    <h1>Check your email</h1>
    <p className="lede" role="status">If there’s an account for <b>{sentTo}</b>, we’ve sent it a link to choose a new password. The link works for 30 minutes. It can take a minute to arrive, and sometimes lands in spam.</p>
    <Button variant="outline" className="auth-button" onClick={onBack}>Back to sign in</Button>
  </> : <>
    <h1>Reset your password</h1>
    <p className="lede">Enter the email you signed up with and we’ll send you a link to choose a new password.</p>
    <form onSubmit={submit} className="form">
      <fieldset disabled={busy} className="form-fields">
        <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
      </fieldset>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <Submit busy={busy}>Send link</Submit>
    </form>
    <p className="auth-links"><button type="button" className="text-link" disabled={busy} onClick={onBack}>Back to sign in</button></p>
  </>;
}

export function ResetPasswordForm({ busy, error, onCancel, onSubmit }: {
  busy: boolean; error: string; onCancel: () => void; onSubmit: (password: string, confirmation: string) => Promise<void>;
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
  return <>
    <h1>Choose a new password</h1>
    <p className="lede">You’ll be signed in here and signed out everywhere else.</p>
    <form onSubmit={submit} className="form" onChange={() => setValidationError('')}>
      <fieldset disabled={busy} className="form-fields">
        <Field label="New password" hint="At least 10 characters."><PasswordInput name="password" autoComplete="new-password" minLength={10} /></Field>
        <Field label="Confirm new password"><PasswordInput name="confirm_password" autoComplete="new-password" minLength={10} /></Field>
      </fieldset>
      {validationError || error ? <p role="alert" className="form-error">{validationError || error}</p> : null}
      <Submit busy={busy}>Save new password</Submit>
    </form>
    <p className="auth-links"><button type="button" className="text-link" disabled={busy} onClick={onCancel}>Cancel</button></p>
  </>;
}

export function ProfileSetup({ name, busy, error, onSubmit, onSignOut }: {
  name: string; busy: boolean; error: string; onSubmit: (profile: Profile) => Promise<void>; onSignOut: () => void;
}) {
  const [gain, setGain] = useState<'yes' | 'no' | null>(null), [lose, setLose] = useState<'yes' | 'no' | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const bodyFat = String(values.get('body_fat') ?? '');
    await onSubmit({
      ...defaultProfile, name, goal: 'maintain',
      height_cm: Number(values.get('height_cm')), age: Number(values.get('age')), weight_kg: Number(values.get('weight_kg')),
      body_fat: bodyFat === '' ? null : Number(bodyFat), difficulty_gain: gain === 'yes', difficulty_lose: lose === 'yes',
    });
  }
  return <>
    <p className="auth-step">Step 2 of 2</p>
    <h1>A few details, {name}</h1>
    <p className="lede">These describe your starting point. You can set your goal and calorie target afterwards, under Profile and goals.</p>
    <form onSubmit={submit} className="form">
      <fieldset disabled={busy} className="form-fields">
        <div className="form-row">
          <Field label="Height" unit="cm"><Input name="height_cm" type="number" inputMode="decimal" min={100} max={250} step="0.1" required /></Field>
          <Field label="Age"><Input name="age" type="number" inputMode="numeric" min={18} max={100} step="1" required /></Field>
        </div>
        <div className="form-row">
          <Field label="Weight" unit="kg"><Input name="weight_kg" type="number" inputMode="decimal" min={25} max={350} step="0.1" required /></Field>
          <Field label="Body fat" unit="%"><Input name="body_fat" type="number" inputMode="decimal" min={3} max={65} step="0.1" placeholder="Optional" /></Field>
        </div>
        <Choice legend="Do you find it hard to gain weight?" name="difficulty_gain" value={gain} options={YES_NO} onChange={setGain} />
        <Choice legend="Do you find it hard to lose weight?" name="difficulty_lose" value={lose} options={YES_NO} onChange={setLose} />
      </fieldset>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <Submit busy={busy}>Open my journal</Submit>
    </form>
    <p className="auth-links"><button type="button" className="text-link" disabled={busy} onClick={onSignOut}>Sign out and finish later</button></p>
  </>;
}
