// Robust STAFF login helper that always lands on /timesheet
const DEFAULT_BASE = process.env.BASE_URL || 'http://localhost:5173';

async function login(page, username, password, baseURL = DEFAULT_BASE) {
  if (!username || !password) {
    throw new Error('STAFF_USER / STAFF_PASS must be set (or pass user/pass to login()).');
  }

  const root = baseURL?.replace(/\/$/, '') || DEFAULT_BASE;

  // 1) Open login
  await page.goto(root, { waitUntil: 'domcontentloaded' });

  // Find username/email field (works for “Username” or “Email”)
  let userInput = page
    .getByPlaceholder(/email|user(name)?/i).first()
    .or(page.getByLabel(/email|user(name)?/i).first())
    .or(page.locator('input[name="email"], input[name="username"], #username, input[type="text"]').first());

  if (!(await userInput.isVisible({ timeout: 1500 }).catch(() => false))) {
    await page.goto(`${root}/login`, { waitUntil: 'domcontentloaded' });
    userInput = page
      .getByPlaceholder(/email|user(name)?/i).first()
      .or(page.getByLabel(/email|user(name)?/i).first())
      .or(page.locator('input[name="email"], input[name="username"], #username, input[type="text"]').first());
  }
  await userInput.waitFor({ state: 'visible', timeout: 15000 });

  const passInput = page
    .getByPlaceholder(/password/i).first()
    .or(page.getByLabel(/password/i).first())
    .or(page.locator('input[type="password"]').first());
  await passInput.waitFor({ state: 'visible', timeout: 15000 });

  // 2) Fill + submit
  await userInput.fill(username);
  await passInput.fill(password);

  const submit = page
    .getByRole('button', { name: /sign\s*in|log\s*in|login/i }).first()
    .or(page.locator('button[type="submit"]').first())
    .or(page.locator('input[type="submit"]').first());
  await submit.click();

  // 3) Give the SPA some time to process; wait for any spinner/overlay to go away (best-effort)
  // We try a few common patterns but don't fail if not found.
  await Promise.race([
    page.waitForURL(/dashboard|timesheet|\/$/, { timeout: 15000 }).catch(() => {}),
    page.getByRole('heading', { name: /welcome/i }).waitFor({ timeout: 15000 }).catch(() => {}),
    (async () => {
      // wait until no common "loading" indicators remain
      try {
        await page.waitForFunction(() => {
          const qs = [
            '.animate-spin',
            '[aria-busy="true"]',
            '[data-loading="true"]',
            '.loading,.spinner,.progress',
          ].join(',');
          return !document.querySelector(qs);
        }, { timeout: 15000 });
      } catch {}
    })(),
    page.waitForTimeout(1500), // tiny debounce so form state updates
  ]);

  // 4) Force navigation to Timesheet (sidebar if present; else direct URL)
  const nav = page
    .getByRole('link', { name: /timesheet/i }).first()
    .or(page.getByRole('button', { name: /timesheet/i }).first())
    .or(page.locator('a:has-text("Timesheet"), button:has-text("Timesheet")').first());

  if ((await nav.count()) > 0) {
    await nav.click();
  } else {
    await page.goto(`${root}/timesheet`, { waitUntil: 'domcontentloaded' });
  }

  // 5) Final assertion: Timesheet visible
  const visible = await page
    .getByRole('heading', { name: /timesheet/i })
    .or(page.getByText(/my assigned shifts/i))
    .isVisible()
    .catch(() => false);

  if (!visible) {
    // We’re still not on timesheet — likely bad creds. Try to surface a useful error.
    const errorMsg = page.getByText(/invalid|incorrect|wrong|failed|not match/i).first();
    if (await errorMsg.isVisible().catch(() => false)) {
      throw new Error(`Login failed: ${(await errorMsg.textContent())?.trim()}`);
    }
    // As a last resort, check if login form is still visible.
    const stillOnLogin =
      (await userInput.isVisible().catch(() => false)) ||
      (await passInput.isVisible().catch(() => false));
    if (stillOnLogin) {
      throw new Error('Login appears to have failed (still on login form). Check STAFF_USER/STAFF_PASS.');
    }
    throw new Error('Timesheet not visible after login — check routing/role.');
  }
}

module.exports = { login };
