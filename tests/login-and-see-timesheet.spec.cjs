// tests/login-and-see-timesheet.spec.cjs
const { test, expect } = require('@playwright/test');
const { login } = require('./utils/login.cjs');

test('staff can log in and see timesheet heading', async ({ page, baseURL }) => {
  const user = process.env.STAFF_USER;
  const pass = process.env.STAFF_PASS;

  await login(page, user, pass, baseURL);

  // prove we’re in the app
  await expect(
    page.getByRole('heading', { name: /timesheet/i })
      .or(page.getByText(/my assigned shifts/i))
  ).toBeVisible();
});
