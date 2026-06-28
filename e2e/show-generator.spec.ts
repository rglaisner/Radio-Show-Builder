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
  showStyleNotes: 'show-style-notes',
  guestMode: 'guest-mode',
  guestCount: 'guest-count',
  musicMood: 'music-mood',
  playbackTimeline: 'playback-timeline',
  playbackVolume: 'playback-volume',
} as const;

async function dismissQuickStart(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

test.describe('Show Generator', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('ai-radio-quickstart-dismissed');
      localStorage.removeItem('ai-radio-advanced-settings');
    });
    await page.goto('/');
  });

  test('should load home page with generate form visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /generate a radio show/i })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Generate radio show' })).toBeVisible();
    await expect(page.locator(`#${FORM_IDS.topic}`)).toBeVisible();
  });

  test('should show quick start guide modal on first visit', async ({ page }) => {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Quick start — how this works')).toBeVisible();
    await expect(dialog.getByText('Preview first')).toBeVisible();
  });

  test('should dismiss quick start guide with Skip', async ({ page }) => {
    await dismissQuickStart(page);
    await expect(page.getByRole('form', { name: 'Generate radio show' })).toBeVisible();
  });

  test('should reopen quick start guide via How it works', async ({ page }) => {
    await dismissQuickStart(page);
    await page.getByRole('button', { name: 'How it works' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Preview first')).toBeVisible();
  });

  test('should have id and name on primary form fields', async ({ page }) => {
    await dismissQuickStart(page);

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
    await dismissQuickStart(page);
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

  test('should select a format starter and update advanced style', async ({ page }) => {
    await dismissQuickStart(page);

    const techDebate = page.getByRole('button', { name: /Tech Debate/i }).first();
    await techDebate.click();

    await expect(techDebate).toHaveClass(/ring-io-blue/);

    await page.getByRole('button', { name: 'Advanced' }).click();

    const showStyle = page.locator(`#${FORM_IDS.showStyle}`);
    await expect(showStyle).toHaveValue('debate');

    const hostPersona = page.locator(`#${FORM_IDS.hostPersona}`);
    await expect(hostPersona).toHaveValue(/measured British moderator/i);
  });

  test('should select an example starter and populate topic and host profile', async ({ page }) => {
    await dismissQuickStart(page);

    await page.getByRole('button', { name: /GitHub Roundtable/i }).click();

    const topic = page.locator(`#${FORM_IDS.topic}`);
    await expect(topic).toHaveValue(/alphafold3/i);

    await page.getByRole('button', { name: 'Advanced' }).click();

    const showStyle = page.locator(`#${FORM_IDS.showStyle}`);
    await expect(showStyle).toHaveValue('roundtable');

    const hostPersona = page.locator(`#${FORM_IDS.hostPersona}`);
    await expect(hostPersona).toHaveValue(/Conversational facilitator/i);
  });

  test('should sync mood selection to show style in advanced panel', async ({ page }) => {
    await dismissQuickStart(page);

    await page.locator(`#${FORM_IDS.mood}`).selectOption('Hype & Energetic');
    await page.getByRole('button', { name: 'Advanced' }).click();

    const showStyle = page.locator(`#${FORM_IDS.showStyle}`);
    await expect(showStyle).toHaveValue('debate');
  });

  test('should allow custom show style in advanced panel', async ({ page }) => {
    await dismissQuickStart(page);
    await page.getByRole('button', { name: 'Advanced' }).click();

    await page.locator(`#${FORM_IDS.showStyle}`).selectOption('custom');
    const notes = page.locator(`#${FORM_IDS.showStyleNotes}`);
    await expect(notes).toBeVisible();
    await notes.fill('Documentary-style long-form panel');
    await expect(notes).toHaveValue('Documentary-style long-form panel');
  });

  test('should open library show and expose player controls with id and name', async ({ page }) => {
    await dismissQuickStart(page);
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
