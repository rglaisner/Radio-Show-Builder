import { test, expect } from '@playwright/test';

test.describe('Production auth gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ai-radio-quickstart-dismissed', '1');
    });
    await page.goto('/');
  });

  test('shows Generate button without Google sign-in in personal production mode', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: 'Generate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In with Google' })).not.toBeVisible();
  });
});
