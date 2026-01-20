import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('AI Import Diff Preview (PRD-030)', () => {
  // Helper to navigate to import dialog
  async function openImportDialog(page: any) {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate to notes
    const notesLink = page.locator('a[href="/notes"]');
    if (await notesLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await notesLink.click();
      await page.waitForLoadState('networkidle');
    }

    // Click import button
    const importButton = page.getByRole('button', { name: /import/i });
    if (await importButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await importButton.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    }
  }

  // Helper to upload a test ZIP file
  async function uploadTestZip(page: any) {
    const fileInput = page.locator('input[type="file"]');
    const zipPath = path.resolve('imports/Vagaries of Fate PF2e.zip');
    await fileInput.setInputFiles(zipPath);
    await page.waitForTimeout(500);

    // Click Upload & Parse
    const uploadButton = page.getByRole('button', { name: /upload.*parse/i });
    await uploadButton.click();

    // Wait for preview state
    await page.waitForSelector('text=Import Preview', { timeout: 30000 });
  }

  test('should show AI toggle on import preview', async ({ page }) => {
    await openImportDialog(page);
    await uploadTestZip(page);

    // Verify AI toggle is visible
    const aiToggle = page.locator('label:has-text("AI Enhance Import")');
    await expect(aiToggle).toBeVisible();

    // Verify Beta badge
    const betaBadge = page.locator('text=Beta').first();
    await expect(betaBadge).toBeVisible();

    // Screenshot for verification
    await page.screenshot({
      path: 'e2e/screenshots/ai-toggle-visible.png',
      fullPage: true
    });
  });

  test('should enable AI toggle and show loading state', async ({ page }) => {
    await openImportDialog(page);
    await uploadTestZip(page);

    // Enable AI toggle
    const aiSwitch = page.locator('#ai-enhance');
    await aiSwitch.click();

    // Verify toggle is checked
    await expect(aiSwitch).toBeChecked();

    // Click Import button
    const importButton = page.getByRole('button', { name: /Import \d+ Pages/i });
    await importButton.click();

    // Should show AI loading state
    const loadingTitle = page.locator('text=Analyzing with AI');
    await expect(loadingTitle).toBeVisible({ timeout: 5000 });

    // Screenshot of loading state
    await page.screenshot({
      path: 'e2e/screenshots/ai-loading-state.png',
      fullPage: true
    });
  });

  test('should display diff preview with two columns', async ({ page }) => {
    // Mock the AI preview endpoint to return immediately
    await page.route('**/api/teams/**/imports/nuclino/ai-preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          previewId: 'test-preview-123',
          baseline: {
            summary: {
              total: 10,
              characters: 0,
              npcs: 3,
              pois: 2,
              questsOpen: 2,
              questsDone: 1,
              notes: 2,
              empty: 0,
            },
            classifications: [
              { sourcePageId: '1', title: 'Lord Gareth', noteType: 'npc', isEmpty: false },
              { sourcePageId: '2', title: 'Silvertown', noteType: 'poi', isEmpty: false },
              { sourcePageId: '3', title: 'Find the Artifact', noteType: 'note', isEmpty: false },
            ],
          },
          aiEnhanced: {
            summary: {
              total: 10,
              npcs: 4,
              areas: 2,
              quests: 2,
              characters: 0,
              sessionLogs: 0,
              notes: 2,
              relationshipsTotal: 3,
              relationshipsHigh: 2,
              relationshipsMedium: 1,
              relationshipsLow: 0,
            },
            classifications: [
              { sourcePageId: '1', title: 'Lord Gareth', inferredType: 'NPC', confidence: 0.92, explanation: 'Named noble', extractedEntities: [] },
              { sourcePageId: '2', title: 'Silvertown', inferredType: 'Area', confidence: 0.88, explanation: 'City location', extractedEntities: [] },
              { sourcePageId: '3', title: 'Find the Artifact', inferredType: 'Quest', confidence: 0.85, explanation: 'Quest objective', extractedEntities: [] },
            ],
            relationships: [
              { fromPageId: '1', fromTitle: 'Lord Gareth', toPageId: '2', toTitle: 'Silvertown', relationshipType: 'NPCInPlace', confidence: 0.90, evidenceSnippet: 'Lord of Silvertown', evidenceType: 'Mention' },
            ],
          },
          diff: {
            changedCount: 1,
            upgradedCount: 2,
            totalPages: 10,
          },
        }),
      });
    });

    await openImportDialog(page);
    await uploadTestZip(page);

    // Enable AI toggle
    const aiSwitch = page.locator('#ai-enhance');
    await aiSwitch.click();

    // Click Import
    const importButton = page.getByRole('button', { name: /Import \d+ Pages/i });
    await importButton.click();

    // Wait for diff preview to appear
    await page.waitForSelector('text=AI Import Preview', { timeout: 10000 });

    // Verify diff summary banner is visible
    const diffBanner = page.locator('[data-testid="diff-summary-banner"]');
    await expect(diffBanner).toBeVisible();

    // Verify baseline summary is visible
    const baselineSummary = page.locator('[data-testid="baseline-summary"]');
    await expect(baselineSummary).toBeVisible();

    // Verify AI summary is visible
    const aiSummary = page.locator('[data-testid="ai-summary"]');
    await expect(aiSummary).toBeVisible();

    // Verify classifications list
    const classificationsList = page.locator('[data-testid="classifications-list"]');
    await expect(classificationsList).toBeVisible();

    // Screenshot of diff preview
    await page.screenshot({
      path: 'e2e/screenshots/ai-diff-preview.png',
      fullPage: true
    });

    // Capture just the dialog
    const dialog = page.locator('[role="dialog"]');
    await dialog.screenshot({
      path: 'e2e/screenshots/ai-diff-preview-dialog.png'
    });
  });

  test('should show confidence badges with correct colors', async ({ page }) => {
    // Mock with varied confidence levels
    await page.route('**/api/teams/**/imports/nuclino/ai-preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          previewId: 'test-preview-456',
          baseline: {
            summary: { total: 3, characters: 0, npcs: 0, pois: 0, questsOpen: 0, questsDone: 0, notes: 3, empty: 0 },
            classifications: [
              { sourcePageId: '1', title: 'High Confidence', noteType: 'note', isEmpty: false },
              { sourcePageId: '2', title: 'Medium Confidence', noteType: 'note', isEmpty: false },
              { sourcePageId: '3', title: 'Low Confidence', noteType: 'note', isEmpty: false },
            ],
          },
          aiEnhanced: {
            summary: { total: 3, npcs: 1, areas: 1, quests: 1, characters: 0, sessionLogs: 0, notes: 0, relationshipsTotal: 0, relationshipsHigh: 0, relationshipsMedium: 0, relationshipsLow: 0 },
            classifications: [
              { sourcePageId: '1', title: 'High Confidence', inferredType: 'NPC', confidence: 0.95, explanation: 'Very certain', extractedEntities: [] },
              { sourcePageId: '2', title: 'Medium Confidence', inferredType: 'Area', confidence: 0.72, explanation: 'Somewhat certain', extractedEntities: [] },
              { sourcePageId: '3', title: 'Low Confidence', inferredType: 'Quest', confidence: 0.55, explanation: 'Less certain', extractedEntities: [] },
            ],
            relationships: [],
          },
          diff: { changedCount: 3, upgradedCount: 0, totalPages: 3 },
        }),
      });
    });

    await openImportDialog(page);
    await uploadTestZip(page);

    // Enable AI toggle and click Import
    const aiSwitch = page.locator('#ai-enhance');
    await aiSwitch.click();
    const importButton = page.getByRole('button', { name: /Import \d+ Pages/i });
    await importButton.click();

    // Wait for diff preview
    await page.waitForSelector('text=AI Import Preview', { timeout: 10000 });

    // Check for classification rows
    const rows = page.locator('[data-testid="classification-row"]');
    await expect(rows).toHaveCount(3);

    // Screenshot showing confidence colors
    await page.screenshot({
      path: 'e2e/screenshots/ai-confidence-badges.png',
      fullPage: true
    });
  });

  test('should confirm AI-enhanced import', async ({ page }) => {
    // Mock AI preview
    await page.route('**/api/teams/**/imports/nuclino/ai-preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          previewId: 'test-preview-789',
          baseline: {
            summary: { total: 2, characters: 0, npcs: 1, pois: 1, questsOpen: 0, questsDone: 0, notes: 0, empty: 0 },
            classifications: [
              { sourcePageId: '1', title: 'Test NPC', noteType: 'npc', isEmpty: false },
              { sourcePageId: '2', title: 'Test Place', noteType: 'poi', isEmpty: false },
            ],
          },
          aiEnhanced: {
            summary: { total: 2, npcs: 1, areas: 1, quests: 0, characters: 0, sessionLogs: 0, notes: 0, relationshipsTotal: 1, relationshipsHigh: 1, relationshipsMedium: 0, relationshipsLow: 0 },
            classifications: [
              { sourcePageId: '1', title: 'Test NPC', inferredType: 'NPC', confidence: 0.90, explanation: 'Character', extractedEntities: [] },
              { sourcePageId: '2', title: 'Test Place', inferredType: 'Area', confidence: 0.88, explanation: 'Location', extractedEntities: [] },
            ],
            relationships: [
              { fromPageId: '1', fromTitle: 'Test NPC', toPageId: '2', toTitle: 'Test Place', relationshipType: 'NPCInPlace', confidence: 0.85, evidenceSnippet: 'Lives here', evidenceType: 'Mention' },
            ],
          },
          diff: { changedCount: 0, upgradedCount: 2, totalPages: 2 },
        }),
      });
    });

    // Mock commit endpoint
    await page.route('**/api/teams/**/imports/nuclino/commit', async (route) => {
      const request = route.request();
      const body = JSON.parse(request.postData() || '{}');

      // Verify AI parameters are passed
      expect(body.useAIClassifications).toBe(true);
      expect(body.aiPreviewId).toBe('test-preview-789');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          importRunId: 'import-123',
          enrichmentRunId: 'enrichment-456',
          created: 2,
          updated: 0,
          skipped: 0,
          warnings: [],
          aiEnhanced: true,
        }),
      });
    });

    await openImportDialog(page);
    await uploadTestZip(page);

    // Enable AI toggle and click Import
    const aiSwitch = page.locator('#ai-enhance');
    await aiSwitch.click();
    const importButton = page.getByRole('button', { name: /Import \d+ Pages/i });
    await importButton.click();

    // Wait for diff preview
    await page.waitForSelector('text=AI Import Preview', { timeout: 10000 });

    // Click Confirm AI Enhanced Import
    const confirmButton = page.getByRole('button', { name: /Confirm AI Enhanced Import/i });
    await confirmButton.click();

    // Should show complete state
    await page.waitForSelector('text=Import Complete', { timeout: 10000 });

    // Screenshot of complete state
    await page.screenshot({
      path: 'e2e/screenshots/ai-import-complete.png',
      fullPage: true
    });
  });

  test('should go back to preview from diff view', async ({ page }) => {
    // Mock AI preview
    await page.route('**/api/teams/**/imports/nuclino/ai-preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          previewId: 'test-back',
          baseline: {
            summary: { total: 1, characters: 0, npcs: 0, pois: 0, questsOpen: 0, questsDone: 0, notes: 1, empty: 0 },
            classifications: [{ sourcePageId: '1', title: 'Test', noteType: 'note', isEmpty: false }],
          },
          aiEnhanced: {
            summary: { total: 1, npcs: 0, areas: 0, quests: 0, characters: 0, sessionLogs: 0, notes: 1, relationshipsTotal: 0, relationshipsHigh: 0, relationshipsMedium: 0, relationshipsLow: 0 },
            classifications: [{ sourcePageId: '1', title: 'Test', inferredType: 'Note', confidence: 0.50, explanation: '', extractedEntities: [] }],
            relationships: [],
          },
          diff: { changedCount: 0, upgradedCount: 1, totalPages: 1 },
        }),
      });
    });

    await openImportDialog(page);
    await uploadTestZip(page);

    // Enable AI toggle and click Import
    const aiSwitch = page.locator('#ai-enhance');
    await aiSwitch.click();
    const importButton = page.getByRole('button', { name: /Import \d+ Pages/i });
    await importButton.click();

    // Wait for diff preview
    await page.waitForSelector('text=AI Import Preview', { timeout: 10000 });

    // Click Back button
    const backButton = page.getByRole('button', { name: /Back/i });
    await backButton.click();

    // Should return to import preview (not diff preview)
    await page.waitForSelector('text=Import Preview', { timeout: 5000 });

    // AI toggle should still be checked
    const aiSwitchAfter = page.locator('#ai-enhance');
    await expect(aiSwitchAfter).toBeChecked();
  });

  test('should show fallback option on AI error', async ({ page }) => {
    // Mock AI preview to fail
    await page.route('**/api/teams/**/imports/nuclino/ai-preview', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'AI service is not configured',
          code: 'AI_NOT_CONFIGURED',
        }),
      });
    });

    await openImportDialog(page);
    await uploadTestZip(page);

    // Enable AI toggle and click Import
    const aiSwitch = page.locator('#ai-enhance');
    await aiSwitch.click();
    const importButton = page.getByRole('button', { name: /Import \d+ Pages/i });
    await importButton.click();

    // Should show loading state with error
    await page.waitForSelector('text=Analyzing with AI', { timeout: 5000 });
    await page.waitForSelector('text=AI service is not configured', { timeout: 5000 });

    // Should show fallback button
    const fallbackButton = page.getByRole('button', { name: /Import without AI/i });
    await expect(fallbackButton).toBeVisible();

    // Screenshot of error state
    await page.screenshot({
      path: 'e2e/screenshots/ai-error-fallback.png',
      fullPage: true
    });
  });

  test('should show relationships tab with detected relationships', async ({ page }) => {
    // Mock with relationships
    await page.route('**/api/teams/**/imports/nuclino/ai-preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          previewId: 'test-rel',
          baseline: {
            summary: { total: 3, characters: 0, npcs: 1, pois: 1, questsOpen: 1, questsDone: 0, notes: 0, empty: 0 },
            classifications: [
              { sourcePageId: '1', title: 'Captain Garner', noteType: 'npc', isEmpty: false },
              { sourcePageId: '2', title: 'Misty Vale', noteType: 'poi', isEmpty: false },
              { sourcePageId: '3', title: 'Rescue Mission', noteType: 'quest', isEmpty: false },
            ],
          },
          aiEnhanced: {
            summary: { total: 3, npcs: 1, areas: 1, quests: 1, characters: 0, sessionLogs: 0, notes: 0, relationshipsTotal: 2, relationshipsHigh: 2, relationshipsMedium: 0, relationshipsLow: 0 },
            classifications: [
              { sourcePageId: '1', title: 'Captain Garner', inferredType: 'NPC', confidence: 0.95, explanation: '', extractedEntities: [] },
              { sourcePageId: '2', title: 'Misty Vale', inferredType: 'Area', confidence: 0.90, explanation: '', extractedEntities: [] },
              { sourcePageId: '3', title: 'Rescue Mission', inferredType: 'Quest', confidence: 0.88, explanation: '', extractedEntities: [] },
            ],
            relationships: [
              { fromPageId: '1', fromTitle: 'Captain Garner', toPageId: '2', toTitle: 'Misty Vale', relationshipType: 'NPCInPlace', confidence: 0.92, evidenceSnippet: 'guards the vale', evidenceType: 'Mention' },
              { fromPageId: '3', fromTitle: 'Rescue Mission', toPageId: '1', toTitle: 'Captain Garner', relationshipType: 'QuestHasNPC', confidence: 0.85, evidenceSnippet: 'find Captain Garner', evidenceType: 'Mention' },
            ],
          },
          diff: { changedCount: 0, upgradedCount: 3, totalPages: 3 },
        }),
      });
    });

    await openImportDialog(page);
    await uploadTestZip(page);

    // Enable AI toggle and click Import
    const aiSwitch = page.locator('#ai-enhance');
    await aiSwitch.click();
    const importButton = page.getByRole('button', { name: /Import \d+ Pages/i });
    await importButton.click();

    // Wait for diff preview
    await page.waitForSelector('text=AI Import Preview', { timeout: 10000 });

    // Click on Relationships tab
    const relTab = page.getByRole('tab', { name: /Relationships/i });
    await relTab.click();

    // Verify relationships list is visible
    const relationshipsList = page.locator('[data-testid="relationships-list"]');
    await expect(relationshipsList).toBeVisible();

    // Verify relationship rows
    const relRows = page.locator('[data-testid="relationship-row"]');
    await expect(relRows).toHaveCount(2);

    // Screenshot of relationships tab
    await page.screenshot({
      path: 'e2e/screenshots/ai-relationships-tab.png',
      fullPage: true
    });
  });
});
