import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, signIn, signOut, signUp } from './helpers';

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name);
const openProfile = async (page: Page) => {
  await page.locator('.account-button').click();
  await page.getByRole('menuitem', { name: 'Profile and goals' }).click();
};
const upload = (page: Page, name: string) => page.locator('input[type=file]').setInputFiles(fixture(name));
const storedPhoto = (page: Page) => page.evaluate(async () => (await (await fetch('/api/profile/photo')).json()).photo as string | null);
const headerPhoto = (page: Page) => page.locator('.account-button img');

/** The colour of one pixel of the photo preview, drawn at 256×256. */
const pixel = (page: Page, x: number, y: number) => page.locator('.photo-preview img').evaluate((img: HTMLImageElement, [x, y]) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.drawImage(img, 0, 0);
  return [...context.getImageData(x, y, 1, 1).data];
}, [x, y]);

test('a photo is shrunk to a 256px square without its metadata, and persists', async ({ page }) => {
  const email = await signUp(page);
  await expect(page.locator('.account-button [data-slot=avatar-fallback]')).toHaveText('Y');
  await openProfile(page);
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
  await upload(page, 'landscape-gps.jpg');
  await expect(page.getByText('Photo saved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();

  const photo = (await storedPhoto(page))!;
  const bytes = Buffer.from(photo.split(',')[1], 'base64');
  expect(bytes.length).toBeLessThan(100_000);
  expect(bytes.includes('Exif')).toBe(false);
  expect(await page.locator('.photo-preview img').evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([256, 256]);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.reload();
  await expect(headerPhoto(page)).toBeVisible();
  await signOut(page);
  await signIn(page, email);
  await expect(headerPhoto(page)).toBeVisible();
});

test('a sideways phone photo comes out upright, and transparency becomes white', async ({ page }) => {
  await signUp(page);
  await openProfile(page);
  // The file is landscape, red on the left, with EXIF "rotate 90° clockwise": shown upright, red is on top.
  await upload(page, 'rotated.jpg');
  await expect(page.getByText('Photo saved')).toBeVisible();
  const [top, bottom] = [await pixel(page, 128, 40), await pixel(page, 128, 216)];
  expect(top[0]).toBeGreaterThan(200);
  expect(bottom[2]).toBeGreaterThan(200);

  const before = await storedPhoto(page);
  await upload(page, 'transparent.png');
  await expect.poll(() => storedPhoto(page)).not.toBe(before);
  await expect.poll(async () => (await pixel(page, 5, 5)).slice(0, 3)).toEqual([255, 255, 255]);
});

test('a file that is not an image shows an error and keeps the current photo', async ({ page }) => {
  await signUp(page);
  await openProfile(page);
  await upload(page, 'notes.txt');
  await expect(page.getByRole('alert').getByText('This file can’t be opened')).toBeVisible();
  expect(await storedPhoto(page)).toBeNull();
});

test('a server failure shows an error in the dialog', async ({ page }) => {
  await signUp(page);
  await openProfile(page);
  await page.route('**/api/profile/photo', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 500, body: 'Internal Server Error' }) : route.continue());
  await upload(page, 'landscape-gps.jpg');
  await expect(page.getByRole('alert').getByText('Could not save your photo. Try again.')).toBeVisible();
  await expect(headerPhoto(page)).toHaveCount(0);
});

test('removing the photo brings back the initial, and other accounts never see it', async ({ page, browser }) => {
  await signUp(page);
  await openProfile(page);
  await upload(page, 'landscape-gps.jpg');
  await expect(page.getByText('Photo saved')).toBeVisible();

  const other = await (await browser.newContext()).newPage();
  await signUp(other, 'Sam');
  expect(await storedPhoto(other)).toBeNull();
  await expect(headerPhoto(other)).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Photo removed')).toBeVisible();
  expect(await storedPhoto(page)).toBeNull();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
  await expect(headerPhoto(page)).toHaveCount(0);
});

test('the profile dialog fits a 320px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await signUp(page);
  await openProfile(page);
  await upload(page, 'landscape-gps.jpg');
  await expect(page.getByText('Photo saved')).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
});
