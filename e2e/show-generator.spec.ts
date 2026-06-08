import { test, expect } from '@playwright/test';

const FORM_IDS = {
  topic: 'show-topic',
  duration: 'show-duration',
  mood: 'show-mood',
  hostName: 'host-name',
  hostVoice: 'host-voice',
  hostPersona: 'host-persona',
  hostDelivery: 'host-delivery',
  showStyle: 'show-style',
  guestMode: 'guest-mode',
  guestCount: 'guest-count',
  musicMood: 'music-mood',
  playbackTimeline: 'playback-timeline',
  playbackVolume: 'playback-volume',
} as const;

test.describe('Show Generator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load home page with generate form visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /generate a radio show/i })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Generate radio show' })).toBeVisible();
    await expect(page.locator(`#${FORM_IDS.topic}`)).toBeVisible();
  });

  test('should have id and name on primary form fields', async ({ page }) => {
    const check = async (selector: string) => {
      const field = page.locator(`#${selector}`);
      await expect(field).toBeVisible();
      await expect(field).toHaveAttribute('name', selector);
    };

    await check(FORM_IDS.topic);
    await check(FORM_IDS.duration);
    await check(FORM_IDS.mood);
  });

  test('should toggle advanced panel and expose labeled fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Advanced' }).click();

    const advancedFields = [
      FORM_IDS.hostName,
      FORM_IDS.hostVoice,
      FORM_IDS.hostPersona,
      FORM_IDS.hostDelivery,
      FORM_IDS.showStyle,
      FORM_IDS.guestMode,
      FORM_IDS.guestCount,
      FORM_IDS.musicMood,
    ];

    for (const fieldId of advancedFields) {
      const field = page.locator(`#${fieldId}`);
      await expect(field).toBeVisible();
      await expect(field).toHaveAttribute('name', fieldId);
    }

    const hostName = page.locator(`#${FORM_IDS.hostName}`);
    await hostName.fill('Jordan');
    await expect(hostName).toHaveValue('Jordan');

    await page.getByRole('button', { name: 'Advanced' }).click();
    await page.getByRole('button', { name: 'Advanced' }).click();

    await expect(hostName).toHaveValue('Jordan');
  });

  test('should select a show format preset and update advanced style', async ({ page }) => {
    const techDebate = page.getByRole('button', { name: /Tech Debate/i });
    await techDebate.click();

    await expect(techDebate).toHaveClass(/ring-io-blue/);

    await page.getByRole('button', { name: 'Advanced' }).click();

    const showStyle = page.locator(`#${FORM_IDS.showStyle}`);
    await expect(showStyle).toHaveValue('debate');
  });

  test('should open library show and expose player controls with id and name', async ({ page }) => {
    await page.getByRole('heading', { name: 'Radio Show Library' }).scrollIntoViewIfNeeded();

    await page
      .getByRole('heading', { name: /Jagged Frontier/i })
      .click();

    const timeline = page.locator(`#${FORM_IDS.playbackTimeline}`);
    await expect(timeline).toBeVisible();
    await expect(timeline).toHaveAttribute('name', FORM_IDS.playbackTimeline);
    await expect(timeline).toHaveAttribute('aria-label', 'Playback timeline');

    const volume = page.locator(`#${FORM_IDS.playbackVolume}`);
    await expect(volume).toBeAttached();
    await expect(volume).toHaveAttribute('name', FORM_IDS.playbackVolume);
    await expect(volume).toHaveAttribute('aria-label', 'Playback volume');
  });
});
