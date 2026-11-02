import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { PASSWORD, field, signIn, signOut, submit, uniqueEmail } from './helpers';

const mail = path.join(import.meta.dirname, '.data', 'mail.txt');

test('a new user signs up, keeps a journal and resets their password', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const email = uniqueEmail('journey'), newPassword = 'battery-staple-77';

  await test.step('signed-out visitors land on sign-in, next to sample data', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Sample data')).toBeVisible();
  });

  await test.step('a wrong password shows an error', async () => {
    await signIn(page, email, 'not-the-password');
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();
  });

  await test.step('the password can be shown and hidden', async () => {
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(field(page, 'password')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(field(page, 'password')).toHaveAttribute('type', 'password');
  });

  await test.step('sign-up checks that both passwords match, each with its own show button', async () => {
    await page.getByRole('button', { name: 'Create an account' }).click();
    await field(page, 'name').fill('Yasser');
    await field(page, 'email').fill(email);
    await field(page, 'password').fill(PASSWORD);
    await field(page, 'confirm_password').fill('something-else-1');
    await page.getByRole('button', { name: 'Show password' }).nth(1).click();
    await expect(field(page, 'confirm_password')).toHaveAttribute('type', 'text');
    await expect(field(page, 'password')).toHaveAttribute('type', 'password');
    await submit(page);
    await expect(page.getByText('Passwords do not match.')).toBeVisible();
  });

  await test.step('the logo returns to sign-in', async () => {
    await page.locator('button.wordmark').click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.getByRole('button', { name: 'Create an account' }).click();
  });

  await test.step('sign up and complete the profile', async () => {
    await field(page, 'name').fill('Yasser');
    await field(page, 'email').fill(email);
    await field(page, 'password').fill(PASSWORD);
    await field(page, 'confirm_password').fill(PASSWORD);
    await submit(page);
    await expect(page.getByRole('heading', { name: 'A few details, Yasser' })).toBeVisible();
    await field(page, 'height_cm').fill('178');
    await field(page, 'age').fill('21');
    await field(page, 'weight_kg').fill('71.5');
    await field(page, 'difficulty_gain').first().check();
    await field(page, 'difficulty_lose').nth(1).check();
    await submit(page);
    await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
    await expect(page.getByText('Your weight curve appears here after a few weigh-ins.')).toBeVisible();
  });

  await test.step('log today', async () => {
    await page.getByRole('button', { name: 'Log today' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Weight').fill('72.4');
    await dialog.getByLabel('Calories').fill('2650');
    await dialog.getByLabel('Steps').fill('8000');
    await dialog.locator('select').selectOption('strength');
    await dialog.getByLabel('Duration').fill('60');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(page.locator('.day-row.is-today').getByText('Strength training, 60 min')).toBeVisible();
    await expect(page.locator('.figure-value').first()).toHaveText('72.4');
  });

  await test.step('edit a day in an earlier week', async () => {
    await page.locator('.week-row').first().click();
    await page.locator('.weeks .day-row').first().click();
    await page.getByRole('dialog').getByLabel('Weight').fill('71.9');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.weeks .day-row').first().getByText('71.9')).toBeVisible();
  });

  await test.step('change the goal', async () => {
    await page.getByRole('button', { name: 'Change' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[name=goal][value=gain]').check();
    await dialog.getByLabel('Pace').fill('0.25');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Goal: gain 0.25 kg a week')).toBeVisible();
  });

  await test.step('the target explainer opens and closes', async () => {
    await page.getByRole('button', { name: 'How it’s set' }).click();
    await expect(page.getByRole('heading', { name: 'How your target is set' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  await test.step('clear the journal', async () => {
    await page.locator('.account-button').click();
    await page.getByRole('menuitem', { name: 'Clear journal…' }).click();
    await page.getByRole('button', { name: 'Delete all entries' }).click();
    await expect(page.getByText('Journal cleared')).toBeVisible();
    await expect(page.getByText('Your weight curve appears here after a few weigh-ins.')).toBeVisible();
  });

  await test.step('the session survives a reload, and signing out ends it', async () => {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
    await signOut(page);
  });

  await test.step('forgot password sends a reset link', async () => {
    fs.rmSync(mail, { force: true });
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await field(page, 'email').fill(email);
    await submit(page);
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to sign in' }).click();
  });

  await test.step('the reset link opens the form and leaves the address bar', async () => {
    await expect.poll(() => fs.existsSync(mail)).toBe(true);
    const token = /#reset=([\w-]+)/.exec(fs.readFileSync(mail, 'utf8'))![1];
    await page.goto(`/#reset=${token}`);
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    expect(page.url()).not.toContain('reset=');
    await field(page, 'password').fill(newPassword);
    await field(page, 'confirm_password').fill(newPassword);
    await submit(page);
    await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
  });

  await test.step('the new password works and the old one does not', async () => {
    await signOut(page);
    await signIn(page, email, PASSWORD);
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();
    await signIn(page, email, newPassword);
    await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
  });

  expect(errors).toEqual([]);
});
