// tests/utils/login.cjs
async function firstVisible(cands, timeout = 30000) {
    const t0 = Date.now();
    for (;;) {
      for (const c of cands) {
        try {
          const el = c.first();
          await el.waitFor({ timeout: 400 });
          if (await el.isVisible()) return el;
        } catch {}
      }
      if (Date.now() - t0 > timeout) throw new Error('No candidate became visible');
    }
  }
  
  async function login(page, username, password, baseURL) {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  
    const userInput = await firstVisible([
      page.getByPlaceholder(/username/i),
      page.getByLabel(/user(name)?/i),
      page.locator('input[name="username"]'),
      page.locator('#username'),
      page.locator('input[type="text"]'),
    ]);
  
    const passInput = await firstVisible([
      page.getByPlaceholder(/password/i),
      page.getByLabel(/password/i),
      page.locator('input[type="password"]'),
      page.locator('#password'),
      page.locator('input[name="password"]'),
    ]);
  
    await userInput.fill(username);
    await passInput.fill(password);
  
    const loginBtn = await firstVisible([
      page.getByRole('button', { name: /sign in|log in|login|submit/i }),
      page.locator('button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login")'),
      page.locator('input[type="submit"]'),
    ]);
  
    await loginBtn.click();
  
    // IMPORTANT: do NOT wait for "networkidle" (vite/fb sockets keep it busy)
    await Promise.race([
      page.waitForFunction(() => !location.pathname.match(/login/i), null, { timeout: 30000 }),
      page.getByRole('heading', { name: /timesheet|dashboard|welcome/i }).waitFor({ timeout: 30000 }),
      page.getByText(/my assigned shifts/i).waitFor({ timeout: 30000 }),
    ]);
  }
  
  module.exports = { login };
  