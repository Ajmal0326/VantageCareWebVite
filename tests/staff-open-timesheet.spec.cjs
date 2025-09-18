const { test, expect } = require('@playwright/test');

test.setTimeout(120_000);

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const USERNAME = process.env.USERNAME || 'Vicky001'; // Firestore doc id (your Login.jsx expects this)
const PASSWORD = process.env.PASSWORD || '123456';

/* ---------- Helpers ---------- */
async function loginViaUserId(page, userId, password) {
  // Your login screen renders at "/"
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // Match exact placeholders from Login.jsx
  const userInput = page.getByPlaceholder('Username').first();
  const passInput = page.getByPlaceholder('Password').first();

  await userInput.waitFor({ state: 'visible', timeout: 15_000 });
  await passInput.waitFor({ state: 'visible', timeout: 15_000 });

  await userInput.fill(userId);
  await passInput.fill(password);

  // Button label is exactly "Sign in"
  await page.getByRole('button', { name: /^sign in$/i }).click();

  // Login.jsx navigates to /dashboard on success
  await page.waitForURL(/\/dashboard(?:\?|#|$)/, { timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded');
}

/** Open Timesheet view using nav if present; otherwise go directly to /timesheet */
async function openTimesheet(page) {
  let trigger =
    page.getByRole('tab', { name: /^timesheet$|^time\s*sheet$/i }).first()
      .or(page.getByRole('link', { name: /^timesheet$|^time\s*sheet$/i }).first())
      .or(page.getByRole('menuitem', { name: /^timesheet$|^time\s*sheet$/i }).first())
      .or(page.locator('a[href*="timesheet"], button:has-text("Timesheet"), button:has-text("Time Sheet")').first());

  if (await trigger.isVisible({ timeout: 1500 }).catch(() => false)) {
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await trigger.click({ timeout: 10_000 });
  } else {
    await page.goto(`${BASE_URL}/timesheet`, { waitUntil: 'domcontentloaded' });
  }

  await Promise.race([
    page.waitForURL(/\/time[-_ ]?sheet/i, { timeout: 20_000 }).catch(() => {}),
    page.getByRole('heading', { name: /^timesheet$/i }).waitFor({ timeout: 20_000 }).catch(() => {}),
  ]);
}

/* ---------- Test ---------- */
test('Vicky001 logs in and opens Timesheet', async ({ page }) => {
  await test.step('Login (Username/Password form)', async () => {
    await loginViaUserId(page, USERNAME, PASSWORD);
  });

  await test.step('Open Timesheet view', async () => {
    await openTimesheet(page);
  });

  await test.step('Verify Timesheet UI (aligned with Timesheet.jsx)', async () => {
    // h1 title
    await expect(page.getByRole('heading', { name: /^timesheet$/i })).toBeVisible();

    // Week navigation buttons (aria-labels from your JSX)
    await expect(page.getByRole('button', { name: /previous week/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /next week/i })).toBeVisible();

    // Section headings
    await expect(page.getByRole('heading', { name: /unassigned days \(this week\)/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /my assigned shifts \(this week\)/i })).toBeVisible();

    // Table header assertions: use text-based locators (not role=columnheader),
    // because some table CSS/markup can hide ARIA roles from Playwright.
    const headerRow = page.locator('thead tr').first();
    await expect(headerRow.getByText(/^Date$/i)).toBeVisible();
    await expect(headerRow.getByText(/^Shift$/i)).toBeVisible();
    await expect(headerRow.getByText(/^Hours$/i)).toBeVisible();
    await expect(headerRow.getByText(/^Status$/i)).toBeVisible();

    // Footer pieces
    await expect(page.getByText(/^Total working hours:/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /submit timesheet/i })).toBeVisible();
  });

  // Optional: if a "Loading…" message briefly appears, let it clear
  const loading = page.getByText(/^Loading…$/); // same ellipsis char as in JSX
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  }
});
