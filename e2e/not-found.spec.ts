import { expect, test } from '@playwright/test';
import { horizontalOverflow, signUp } from './helpers';

for (const width of [320, 1440]) {
  test(`unknown addresses get a 404 page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const response = await page.goto('/a/page/that/does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page).toHaveTitle('Page not found | Tally');
    expect(await horizontalOverflow(page)).toBe(0);
  });
}

test('Back to Tally leads to sign-in, or to the journal when signed in', async ({ page }) => {
  await page.goto('/nope');
  await page.getByRole('link', { name: 'Back to Tally' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  await signUp(page);
  await page.goto('/nope');
  await page.getByRole('link', { name: 'Back to Tally' }).click();
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
});

test('unknown API addresses still answer with JSON', async ({ request }) => {
  const response = await request.get('/api/nope');
  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({ detail: 'Not found' });
});
