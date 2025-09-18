
const { test, expect } = require('@playwright/test');

test.setTimeout(180_000);

/* ---------- Config ---------- */
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const USERNAME = process.env.USERNAME || 'Vicky001'; // Login.jsx expects userId here
const PASSWORD = process.env.PASSWORD || '123456';

/* ---------- Tiny time utils ---------- */
function parseHM(hm) {
  const [H, M] = String(hm).split(':').map(n => parseInt(n || '0', 10));
  return H * 60 + M;
}
function hmFromMinutes(mins) {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const H = Math.floor(m / 60);
  const M = m % 60;
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
}
function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }


async function loginViaUserId(page, userId, password) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  const userInput = page.getByPlaceholder('Username').first(); // Login.jsx
  const passInput = page.getByPlaceholder('Password').first();

  await userInput.waitFor({ state: 'visible', timeout: 15_000 });
  await passInput.waitFor({ state: 'visible', timeout: 15_000 });

  await userInput.fill(userId);
  await passInput.fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await page.waitForURL(/\/dashboard(?:\?|#|$)/, { timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded');
}

async function openTimesheet(page) {
  let trigger =
    page.getByRole('link', { name: /^timesheet$/i }).first()
      .or(page.getByRole('tab', { name: /^time\s*sheet$|^timesheet$/i }).first())
      .or(page.locator('a[href*="timesheet"], button:has-text("Timesheet"), button:has-text("Time Sheet")').first());

  if (await trigger.isVisible({ timeout: 1500 }).catch(() => false)) {
    await trigger.click();
  } else {
    await page.goto(`${BASE_URL}/timesheet`, { waitUntil: 'domcontentloaded' });
  }

  await Promise.race([
    page.waitForURL(/\/time[-_ ]?sheet/i, { timeout: 20_000 }).catch(() => {}),
    page.getByRole('heading', { name: /^timesheet$/i }).waitFor({ timeout: 20_000 }).catch(() => {}),
  ]);
}

/** Waits for any "Loading…" badge in the Unassigned section to disappear */
async function waitForTimesheetSettled(page) {
  const loading = page.getByText(/^Loading…$/);
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  }
}

/**
 * Find the first editable row (has an "Edit" button) by scanning weeks.
 * Searches current week, then up to 4 weeks forward, then up to 4 back.
 * Returns the row locator, plus its date string from the first column.
 */
async function findEditableRowAcrossWeeks(page) {
  const prevBtn = page.getByRole('button', { name: /previous week/i });
  const nextBtn = page.getByRole('button', { name: /next week/i });

  async function findEditableInCurrentWeek() {
    const table = page.locator('tbody');
    const rows = table.locator('tr');
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const editBtn = row.getByRole('button', { name: /^edit$/i });
      if (await editBtn.isVisible().catch(() => false)) {
        // first cell is the date
        const dateCell = row.locator('td').first();
        const dateText = (await dateCell.textContent() || '').trim();
        return { row, dateText };
      }
    }
    return null;
  }

  // current week
  await waitForTimesheetSettled(page);
  let found = await findEditableInCurrentWeek();
  if (found) return found;

  // look forward up to 4 weeks
  for (let i = 0; i < 4; i++) {
    await nextBtn.click();
    await waitForTimesheetSettled(page);
    found = await findEditableInCurrentWeek();
    if (found) return found;
  }

  // go back to start
  for (let i = 0; i < 4; i++) await prevBtn.click();
  await waitForTimesheetSettled(page);

  // look backward up to 4 weeks
  for (let i = 0; i < 4; i++) {
    await prevBtn.click();
    await waitForTimesheetSettled(page);
    found = await findEditableInCurrentWeek();
    if (found) return found;
  }

  return null;
}

/* ---------- Test ---------- */
test('Vicky001 edits an existing shift: start +1h, end −1h → becomes Pending with Requested times', async ({ page }) => {
  await test.step('Login as staff & open Timesheet', async () => {
    await loginViaUserId(page, USERNAME, PASSWORD);
    await openTimesheet(page);
    await expect(page.getByRole('heading', { name: /^timesheet$/i })).toBeVisible();
  });

  let targetRow, targetDate;
  await test.step('Find any editable shift (non-pending) across nearby weeks', async () => {
    const found = await findEditableRowAcrossWeeks(page);
    if (!found) {
      test.skip(true, 'No editable shifts found in the last/next few weeks for this account.');
    }
    targetRow  = found.row;
    targetDate = found.dateText;
  });

  let newStartHM, newEndHM;
  await test.step('Open inline editor and adjust times (+1h start, −1h end)', async () => {
    await targetRow.getByRole('button', { name: /^edit$/i }).click();

    const startInput = targetRow.getByLabel(/^Start$/i);
    const endInput   = targetRow.getByLabel(/^End$/i);

    await startInput.waitFor({ timeout: 10_000 });
    await endInput.waitFor({ timeout: 10_000 });

    // read current values
    const currStart = await startInput.inputValue(); // "HH:mm"
    const currEnd   = await endInput.inputValue();   // "HH:mm"

    let sMin = parseHM(currStart || '09:00') + 60; // +1h
    let eMin = parseHM(currEnd   || '17:00') - 60; // -1h
    if (eMin <= sMin) eMin = sMin + 15; // keep valid window

    newStartHM = hmFromMinutes(sMin);
    newEndHM   = hmFromMinutes(eMin);

    await startInput.fill(newStartHM);
    await endInput.fill(newEndHM);

    await targetRow.getByRole('button', { name: /^save$/i }).click();
  });

  await test.step('Verify the row shows Pending + Requested times', async () => {
    // After save, row is re-rendered; re-locate by date
    const row = page.locator('tbody tr').filter({
      has: page.locator('td', { hasText: new RegExp(`^\\s*${escRe(targetDate)}\\s*$`) })
    }).first();

    // Status pill
    await expect(row.getByText(/awaiting approval/i)).toBeVisible({ timeout: 15_000 });

    // "Requested:" helper line
    await expect(row.getByText(/^Requested:/i)).toBeVisible({ timeout: 10_000 });

    // We don't assert exact 12h formatting here because the component renders it;
    // presence of Requested line is sufficient to confirm edit request was recorded.
  });
});
