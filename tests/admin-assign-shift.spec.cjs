const { test, expect } = require('@playwright/test');

test.setTimeout(120_000);

const BASE_URL   = process.env.BASE_URL   || 'http://localhost:5173';
const ADMIN_USER = process.env.ADMIN_USER || 'Alex002';
const ADMIN_PASS = process.env.ADMIN_PASS || '123456';

const STAFF_NAME = process.env.STAFF_NAME || 'vicky';

/* Tomorrow in local YYYY-MM-DD */
function tomorrowYMD() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const SHIFT_DATE  = process.env.SHIFT_DATE  || tomorrowYMD();
const SHIFT_ROLE  = process.env.SHIFT_ROLE  || 'morning';
const SHIFT_START = process.env.SHIFT_START || '09:00';
const SHIFT_END   = process.env.SHIFT_END   || '17:00';


function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function login(page, username, password) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  const user = page.getByPlaceholder('Username').first();
  const pass = page.getByPlaceholder('Password').first();
  await user.waitFor({ state: 'visible', timeout: 15_000 });
  await pass.waitFor({ state: 'visible', timeout: 15_000 });

  await user.fill(username);
  await pass.fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await page.waitForURL(/\/dashboard(?:\?|#|$)/, { timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded');
}

async function waitForAdminDashboard(page) {
  await expect(page.getByText(/^Role:\s*(Admin|HR)/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /^staff list$/i })).toBeVisible({ timeout: 30_000 });

  const loading = page.getByText(/^Loading staff list/i);
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  }

  await expect.poll(async () => page.getByRole('listitem').count(), {
    timeout: 60_000,
    intervals: [500, 1000],
  }).toBeGreaterThan(0);
}

/** Find the <li> that really contains the staff name (case-insensitive). */
async function findStaffRow(page, name) {
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByText(new RegExp(`\\b${escRe(name)}\\b`, 'i')) })
    .first();

  await expect(row, `Staff row for "${name}" not found`).toBeVisible({ timeout: 30_000 });
  await row.scrollIntoViewIfNeeded().catch(() => {});
  return row;
}

/** Open the Assign Shift panel for a given row (desktop: "Assign Shift", mobile: "Assign"). */
async function openAssignFormForRow(row) {
  const btn = row.getByRole('button', { name: /assign( shift)?/i }).first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await expect(row.page().getByRole('heading', { name: /assign shift/i }))
    .toBeVisible({ timeout: 15_000 });
}

/** Fill the assign form with given values and click Save (does not assert outcomes). */
async function fillAndSaveAssignForm(page, { dateStr, role, start, end }) {
  const panel = page.locator('div', {
    has: page.getByRole('heading', { name: /assign shift/i }),
  }).first();

  const date = panel.getByLabel(/^Date$/i).or(panel.locator('input[type="date"]').first());
  await date.fill(dateStr);

  let roleInput = panel.getByLabel(/^Shift Role$/i);
  if (!(await roleInput.isVisible().catch(() => false))) {
    roleInput = panel.getByPlaceholder(/morning.*evening.*night/i);
  }
  await roleInput.fill('');
  await roleInput.type(role, { delay: 10 });
  await expect(roleInput).toHaveValue(role);

  const startInput = panel.getByLabel(/^Start Time$/i).or(panel.locator('input[type="time"]').nth(0));
  const endInput   = panel.getByLabel(/^End Time/i).or(panel.locator('input[type="time"]').nth(1));
  await startInput.fill(start);
  await endInput.fill(end);

  // Save
  const dialogPromise = page.waitForEvent('dialog', { timeout: 6000 }).catch(() => null);
  await panel.getByRole('button', { name: /^save shift$/i }).click();
  return dialogPromise; // may resolve if success alert fires
}

/** Ensure staff has a shift on date: if missing, create one (accept alert, wait for it to render). */
async function ensureShiftExists(page, row, { dateStr, role, start, end }) {
  // If shift already present, we're done
  const already = await row
    .locator('div', { hasText: new RegExp(`\\b${escRe(dateStr)}\\b`) })
    .count();
  if (already > 0) return;

  // Otherwise create one
  await openAssignFormForRow(row);
  const dlg = await fillAndSaveAssignForm(page, { dateStr, role, start, end });
  if (dlg) await dlg.accept();

  // Wait for it to appear under the row
  const line = row.locator('div', {
    hasText: new RegExp(`${escRe(dateStr)}.*\\b${escRe(role)}\\b`, 'i'),
  }).first();
  await expect.poll(async () => await line.count(), {
    timeout: 45_000, intervals: [500, 1000],
  }).toBeGreaterThan(0);
}

test('admin sees duplicate-shift validation when assigning a day that is already taken', async ({ page }) => {
  await test.step('Login & land on Admin dashboard', async () => {
    await login(page, ADMIN_USER, ADMIN_PASS);
    await waitForAdminDashboard(page);
  });

  // Find the staff row
  const row = await findStaffRow(page, STAFF_NAME);

  // Precondition: make sure a shift exists on SHIFT_DATE
  await test.step(`Ensure ${STAFF_NAME} already has a shift on ${SHIFT_DATE}`, async () => {
    await ensureShiftExists(page, row, {
      dateStr: SHIFT_DATE,
      role: SHIFT_ROLE,
      start: SHIFT_START,
      end: SHIFT_END,
    });
  });

  // Attempt to assign AGAIN on the same date -> expect validation banner
  await test.step('Try assigning the same day again and expect the red duplicate banner', async () => {
    await openAssignFormForRow(row);

    // Fill same date/role/times and save
    const dialogPromise = await fillAndSaveAssignForm(page, {
      dateStr: SHIFT_DATE,
      role: SHIFT_ROLE,
      start: SHIFT_START,
      end: SHIFT_END,
    });

    // Assert duplicate banner appears
    const panel = page.locator('div', {
      has: page.getByRole('heading', { name: /assign shift/i }),
    }).first();

    const duplicateBanner = panel.getByText(
      new RegExp(`already has a shift on\\s+${escRe(SHIFT_DATE)}`, 'i')
    );

    await expect(duplicateBanner).toBeVisible({ timeout: 5000 });

    // If by any chance a success alert popped, fail (we expected a duplicate)
    const dlg = await dialogPromise;
    if (dlg) {
      await dlg.dismiss().catch(() => {});
      throw new Error('Expected duplicate warning, but got success alert instead.');
    }
  });
});
