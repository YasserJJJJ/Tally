import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'correct-horse-9';
export const field = (page: Page, name: string) => page.locator(`[name=${name}]`);
export const submit = (page: Page) => page.locator('form [type=submit]').click();
export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** Creates an account, completes onboarding and waits for the journal. */
export async function signUp(page: Page, name = 'Yasser', email = uniqueEmail(name.toLowerCase())) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await field(page, 'name').fill(name);
  await field(page, 'email').fill(email);
  await field(page, 'password').fill(PASSWORD);
  await field(page, 'confirm_password').fill(PASSWORD);
  await submit(page);
  await field(page, 'height_cm').fill('178');
  await field(page, 'age').fill('21');
  await field(page, 'weight_kg').fill('71.5');
  await field(page, 'difficulty_gain').first().check();
  await field(page, 'difficulty_lose').nth(1).check();
  await submit(page);
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
  return email;
}

export async function signOut(page: Page) {
  await page.locator('.account-button').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await field(page, 'email').fill(email);
  await field(page, 'password').fill(password);
  await submit(page);
}

export const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
