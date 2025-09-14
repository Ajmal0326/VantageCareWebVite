// tests/admin-assign-shift.spec.cjs
const { test, expect } = require('@playwright/test');

test.setTimeout(90_000);

const BASE_URL    = process.env.BASE_URL    || 'http://localhost:5173';
const ADMIN_USER  = process.env.ADMIN_USER  || 'Alex002';
const ADMIN_PASS  = process.env.ADMIN_PASS  || '123456';

const STAFF_NAME  = process.env.STAFF_NAME  || 'Vicky001';
const SHIFT_DATE  = process.env.SHIFT_DATE  || '2025-09-15';
const SHIFT_ROLE  = process.env.SHIFT_ROLE  || 'morning';
const SHIFT_START = process.env.SHIFT_START || '08:00';
const SHIFT_END   = process.env.SHIFT_END   || '18:00';

function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function login(page, username, password) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  const userInput = page
    .getByPlaceholder(/username/i).first()
    .or(page.getByLabel(/user(name)?/i).first())
    .or(page.locator('input[name="username"], #username, input[type="text"]').first());

  // If not visible at /, try /login
  try { await userInput.waitFor({ state:'visible', timeout:8000 }); }
  catch {
    await page.goto(`${BASE_URL}/login`, { waitUntil:'domcontentloaded' });
    await userInput.waitFor({ state:'visible', timeout:15000 });
  }

  const passInput = page
    .getByPlaceholder(/password/i).first()
    .or(page.getByLabel(/password/i).first())
    .or(page.locator('input[type="password"]').first());

  await userInput.fill(username);
  await passInput.fill(password);
  await page.getByRole('button', { name:/sign in/i }).first().click();

  // Post-login cue (don’t use networkidle with SPAs)
  await Promise.race([
    page.waitForURL(/dashboard|\/$/, { timeout:30000 }),
    page.getByRole('heading', { name:/welcome/i }).waitFor({ timeout:30000 }),
  ]);
}

async function waitForStaffListReady(page) {
  // 1) Heading exists (unique)
  await expect(page.getByRole('heading', { name: /^Staff List$/i })).toBeVisible();

  // 2) Loading row disappears (this avoids strict-mode collision)
  const loading = page.locator('text=/^Loading staff list/i');
  await loading.waitFor({ state: 'hidden', timeout: 60_000 });

  // 3) List has at least one row (robust against slow Firestore)
  await expect.poll(
    async () => await page.locator('li').count(),
    { timeout: 60_000, intervals: [500, 1000] }
  ).toBeGreaterThan(0);
}

test('admin assigns a shift to a staff member', async ({ page }) => {
  await login(page, ADMIN_USER, ADMIN_PASS);
  await waitForStaffListReady(page);

  // Target staff row
  const row = page.locator('li', { hasText: new RegExp(escRe(STAFF_NAME), 'i') }).first();
  await row.waitFor({ timeout: 30_000 });

  // Open assign form
  await row.getByRole('button', { name: /assign( shift)?/i }).first().click();

  // Fill form
  await page.getByLabel(/^Date$/i).fill(SHIFT_DATE);
  await page.getByLabel(/^Shift Role$/i).fill(SHIFT_ROLE);
  await page.getByLabel(/^Start Time$/i).fill(SHIFT_START);
  await page.getByLabel(/^End Time/i).fill(SHIFT_END);

  // App shows alert on success — accept it
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name:/save shift/i }).click();

  // Assert row reflects new shift
  await expect(row.getByText(SHIFT_DATE)).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText(/\bassigned\b/i)).toBeVisible();
});
