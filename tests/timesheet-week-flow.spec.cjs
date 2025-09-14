// tests/timesheet-week-flow.spec.cjs
const { test, expect } = require('@playwright/test');
const { login } = require('./utils/login.cjs');

test('staff can view timesheet and switch week', async ({ page, baseURL }) => {
  await login(page, process.env.STAFF_USER, process.env.STAFF_PASS, baseURL);

  // verify the assigned table exists
  await expect(page.getByText(/my assigned shifts/i)).toBeVisible();

  // click next week (right arrow)
  await page.getByRole('button', { name: /→|next/i }).first().click();
  // click back to current week (left arrow)
  await page.getByRole('button', { name: /←|previous/i }).first().click();

  // total hours label visible
  await expect(page.getByText(/total working hours/i)).toBeVisible();
});
