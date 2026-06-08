# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: show-generator.spec.ts >> Show Generator >> should toggle advanced panel and expose labeled fields
- Location: e2e\show-generator.spec.ts:42:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Advanced' })
    - locator resolved to <button type="button" class="flex items-center gap-2 bg-white/[0.04] border border-white/5 rounded-full px-3 py-1.5 hover:bg-white/[0.08] transition-all text-[11px] font-bold text-white/70 uppercase tracking-wider cursor-pointer">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed

```

# Page snapshot

```yaml
- generic [ref=e5]:
  - generic [ref=e6]:
    - generic [ref=e7]:
      - heading "Generate a radio show" [level=1] [ref=e8]
      - paragraph [ref=e9]:
        - text: powered by
        - link "gemini managed agents" [ref=e10] [cursor=pointer]:
          - /url: https://blog.google/innovation-and-ai/technology/developers-tools/managed-agents-gemini-api/
    - form "Generate radio show" [ref=e11]:
      - generic [ref=e14]:
        - textbox "I want a talk radio show about...." [ref=e16]
        - generic [ref=e17]:
          - generic [ref=e18]:
            - generic [ref=e19]:
              - img [ref=e20]
              - combobox [ref=e23] [cursor=pointer]:
                - option "3 Min" [selected]
                - option "5 Min"
                - option "10 Min"
                - option "15 Min"
            - generic [ref=e24]:
              - img [ref=e25]
              - combobox [ref=e26] [cursor=pointer]:
                - option "Informative" [selected]
                - option "Conversational"
                - option "Late Night Chill"
                - option "Energetic"
                - option "Experimental"
            - button "Advanced" [ref=e27] [cursor=pointer]:
              - img [ref=e28]
              - text: Advanced
              - img [ref=e31]
          - button "Generate Gemini" [ref=e33] [cursor=pointer]:
            - text: Generate
            - img "Gemini"
      - generic [ref=e34]:
        - generic [ref=e35]:
          - img [ref=e36]
          - generic [ref=e42]: Show format presets
        - generic [ref=e43]:
          - button "Tech Debate Two opposing callers debate the hottest tech stories" [ref=e44] [cursor=pointer]:
            - text: Tech Debate
            - paragraph [ref=e45]: Two opposing callers debate the hottest tech stories
          - button "Roundtable Chill Relaxed panel riffing on ideas from multiple angles" [ref=e46] [cursor=pointer]:
            - text: Roundtable Chill
            - paragraph [ref=e47]: Relaxed panel riffing on ideas from multiple angles
          - button "Deep Interview One-on-one Q&A with a knowledgeable guest" [ref=e48] [cursor=pointer]:
            - text: Deep Interview
            - paragraph [ref=e49]: One-on-one Q&A with a knowledgeable guest
          - button "Explainer Hour Collaborative breakdown of complex topics" [ref=e50] [cursor=pointer]:
            - text: Explainer Hour
            - paragraph [ref=e51]: Collaborative breakdown of complex topics
          - button "Late Night Labs Intimate late-night show with dry wit and station branding" [ref=e52] [cursor=pointer]:
            - text: Late Night Labs
            - paragraph [ref=e53]: Intimate late-night show with dry wit and station branding
          - button "Call-In Hotline High-energy call-in show with listener questions" [ref=e54] [cursor=pointer]:
            - text: Call-In Hotline
            - paragraph [ref=e55]: High-energy call-in show with listener questions
      - generic [ref=e56]:
        - generic [ref=e59]:
          - text: Each radio show generation takes
          - strong [ref=e60]: ~5 minutes
          - text: to research and voice.
        - generic [ref=e62]: Please do not submit any sensitive or personal information.
    - generic [ref=e63]:
      - generic [ref=e64]:
        - generic [ref=e65]:
          - img [ref=e66]
          - generic [ref=e69]: Try a template
        - generic [ref=e70]:
          - button "Tech & AI" [ref=e71] [cursor=pointer]
          - button "Arts & Life" [ref=e72] [cursor=pointer]
          - button "News & Sports" [ref=e73] [cursor=pointer]
      - generic [ref=e74]:
        - button "Daily Hacker Bites → Voice a digest of the top stories currently on Hacker News" [ref=e75] [cursor=pointer]:
          - generic [ref=e76]:
            - generic [ref=e77]: Daily Hacker Bites
            - generic [ref=e78]: →
          - paragraph [ref=e79]: Voice a digest of the top stories currently on Hacker News
        - button "GitHub Roundtable → Review the AlphaFold 3 repository and Google DeepMind's biology model" [ref=e80] [cursor=pointer]:
          - generic [ref=e81]:
            - generic [ref=e82]: GitHub Roundtable
            - generic [ref=e83]: →
          - paragraph [ref=e84]: Review the AlphaFold 3 repository and Google DeepMind's biology model
  - generic [ref=e85]:
    - generic [ref=e86]:
      - heading "Radio Show Library" [level=3] [ref=e87]
      - paragraph [ref=e88]: You can immediately play and listen to these pre-generated shows to preview the experience.
    - generic [ref=e90] [cursor=pointer]:
      - img [ref=e95]
      - generic [ref=e97]:
        - generic [ref=e98]:
          - generic [ref=e99]:
            - 'heading "The Jagged Frontier: Vibe Coding and Valve''s Open Windows" [level=4] [ref=e100]'
            - generic [ref=e101]:
              - generic [ref=e102]:
                - img [ref=e103]
                - text: 5:01
              - generic [ref=e107]:
                - img [ref=e108]
                - text: Jordan
          - button "Download Show Bundle" [ref=e115]:
            - img [ref=e116]
        - paragraph [ref=e119]: Jordan leads a discussion on the rise of 'vibe coding' and the potential for agentic engineering to disrupt traditional software quality standards. The episode also covers Valve's decision to open-source Steam Controller hardware files and the endorsement of SQLite by the Library of Congress.
      - generic: "01"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const FORM_IDS = {
  4   |   topic: 'show-topic',
  5   |   duration: 'show-duration',
  6   |   mood: 'show-mood',
  7   |   hostName: 'host-name',
  8   |   hostVoice: 'host-voice',
  9   |   hostPersona: 'host-persona',
  10  |   hostDelivery: 'host-delivery',
  11  |   showStyle: 'show-style',
  12  |   guestMode: 'guest-mode',
  13  |   guestCount: 'guest-count',
  14  |   musicMood: 'music-mood',
  15  |   playbackTimeline: 'playback-timeline',
  16  |   playbackVolume: 'playback-volume',
  17  | } as const;
  18  | 
  19  | test.describe('Show Generator', () => {
  20  |   test.beforeEach(async ({ page }) => {
  21  |     await page.goto('/');
  22  |   });
  23  | 
  24  |   test('should load home page with generate form visible', async ({ page }) => {
  25  |     await expect(page.getByRole('heading', { name: /generate a radio show/i })).toBeVisible();
  26  |     await expect(page.getByRole('form', { name: 'Generate radio show' })).toBeVisible();
  27  |     await expect(page.locator(`#${FORM_IDS.topic}`)).toBeVisible();
  28  |   });
  29  | 
  30  |   test('should have id and name on primary form fields', async ({ page }) => {
  31  |     const check = async (selector: string) => {
  32  |       const field = page.locator(`#${selector}`);
  33  |       await expect(field).toBeVisible();
  34  |       await expect(field).toHaveAttribute('name', selector);
  35  |     };
  36  | 
  37  |     await check(FORM_IDS.topic);
  38  |     await check(FORM_IDS.duration);
  39  |     await check(FORM_IDS.mood);
  40  |   });
  41  | 
  42  |   test('should toggle advanced panel and expose labeled fields', async ({ page }) => {
> 43  |     await page.getByRole('button', { name: 'Advanced' }).click();
      |                                                          ^ Error: locator.click: Test timeout of 30000ms exceeded.
  44  | 
  45  |     const advancedFields = [
  46  |       FORM_IDS.hostName,
  47  |       FORM_IDS.hostVoice,
  48  |       FORM_IDS.hostPersona,
  49  |       FORM_IDS.hostDelivery,
  50  |       FORM_IDS.showStyle,
  51  |       FORM_IDS.guestMode,
  52  |       FORM_IDS.guestCount,
  53  |       FORM_IDS.musicMood,
  54  |     ];
  55  | 
  56  |     for (const fieldId of advancedFields) {
  57  |       const field = page.locator(`#${fieldId}`);
  58  |       await expect(field).toBeVisible();
  59  |       await expect(field).toHaveAttribute('name', fieldId);
  60  |     }
  61  | 
  62  |     const hostName = page.locator(`#${FORM_IDS.hostName}`);
  63  |     await hostName.fill('Jordan');
  64  |     await expect(hostName).toHaveValue('Jordan');
  65  | 
  66  |     await page.getByRole('button', { name: 'Advanced' }).click();
  67  |     await page.getByRole('button', { name: 'Advanced' }).click();
  68  | 
  69  |     await expect(hostName).toHaveValue('Jordan');
  70  |   });
  71  | 
  72  |   test('should select a show format preset and update advanced style', async ({ page }) => {
  73  |     const techDebate = page.getByRole('button', { name: /Tech Debate/i });
  74  |     await techDebate.click();
  75  | 
  76  |     await expect(techDebate).toHaveClass(/ring-io-blue/);
  77  | 
  78  |     await page.getByRole('button', { name: 'Advanced' }).click();
  79  | 
  80  |     const showStyle = page.locator(`#${FORM_IDS.showStyle}`);
  81  |     await expect(showStyle).toHaveValue('debate');
  82  |   });
  83  | 
  84  |   test('should open library show and expose player controls with id and name', async ({ page }) => {
  85  |     await page.getByRole('heading', { name: 'Radio Show Library' }).scrollIntoViewIfNeeded();
  86  | 
  87  |     await page
  88  |       .getByRole('heading', { name: /Jagged Frontier/i })
  89  |       .click();
  90  | 
  91  |     const timeline = page.locator(`#${FORM_IDS.playbackTimeline}`);
  92  |     await expect(timeline).toBeVisible();
  93  |     await expect(timeline).toHaveAttribute('name', FORM_IDS.playbackTimeline);
  94  |     await expect(timeline).toHaveAttribute('aria-label', 'Playback timeline');
  95  | 
  96  |     const volume = page.locator(`#${FORM_IDS.playbackVolume}`);
  97  |     await expect(volume).toBeAttached();
  98  |     await expect(volume).toHaveAttribute('name', FORM_IDS.playbackVolume);
  99  |     await expect(volume).toHaveAttribute('aria-label', 'Playback volume');
  100 |   });
  101 | });
  102 | 
```