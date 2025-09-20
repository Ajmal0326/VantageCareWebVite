// tests/login-wrong-password.spec.ts
import { test, expect } from '@playwright/test';

test.setTimeout(120_000);

/**
 * Configure via env or fall back to sensible defaults.
 * USERNAME must exist in Firestore (UsersDetail/<userID>),
 * BAD_PASS must be incorrect for that user.
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const USERNAME  = process.env.USERNAME  || 'Vicky001';
const BAD_PASS  = process.env.BAD_PASS  || '12345677';

test('Login FAILS with wrong password (must show error and not navigate)', async ({ page }) => {
  // Go to login
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // Fill form (placeholders match your component)
  await page.getByPlaceholder('Username').fill(USERNAME);
  await page.getByPlaceholder('Password').fill(BAD_PASS);

  // If your UI shows a spinner overlay, it's okay; we still wait for the alert.
  // Arm the dialog listener BEFORE clicking, so we don't miss it.
  const waitForDialog = page.waitForEvent('dialog', { timeout: 30_000 });

  // Click "Sign in"
  await page.getByRole('button', { name: /^sign in$/i }).click();

  // If no alert appears in time, this throws -> test FAILS.
  const dialog = await waitForDialog;
  const message = dialog.message();
  await dialog.accept();

  // Message must look like a wrong-password error (your code shows one of these)
  expect(message).toMatch(
    /(Wrong Password|invalid-credential|auth\/wrong-password|The password is incorrect)/i
  );

  // Must NOT navigate to dashboard on failure
  await expect(page).not.toHaveURL(/\/dashboard(?:\?|#|$)/);

  // Still on login: core elements remain visible
  await expect(page.getByPlaceholder('Username')).toBeVisible();
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
});
