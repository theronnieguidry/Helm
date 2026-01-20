import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Nuclino Import Preview', () => {
  test('capture import preview display for bug analysis', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for the app to load (either landing or authenticated view)
    await page.waitForLoadState('networkidle');

    // Take initial screenshot
    await page.screenshot({
      path: 'e2e/screenshots/01-initial-load.png',
      fullPage: true
    });

    // Check if we need to navigate to notes
    // The sidebar should have a link to Notes/Sessions
    const notesLink = page.locator('a[href="/notes"]');

    if (await notesLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await notesLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Try clicking on Sessions in the sidebar
      const sessionsLink = page.getByRole('link', { name: /sessions/i });
      if (await sessionsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sessionsLink.click();
        await page.waitForLoadState('networkidle');
      }
    }

    // Screenshot after navigation
    await page.screenshot({
      path: 'e2e/screenshots/02-notes-page.png',
      fullPage: true
    });

    // Look for the Import button
    const importButton = page.getByRole('button', { name: /import/i });

    if (await importButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await importButton.click();

      // Wait for import dialog to appear
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Screenshot the upload dialog
      await page.screenshot({
        path: 'e2e/screenshots/03-import-dialog-upload.png',
        fullPage: true
      });

      // Find the file input and upload the ZIP
      const fileInput = page.locator('input[type="file"]');
      const zipPath = path.resolve('imports/Vagaries of Fate PF2e.zip');

      await fileInput.setInputFiles(zipPath);

      // Wait a moment for the file to be selected
      await page.waitForTimeout(500);

      // Screenshot after file selection
      await page.screenshot({
        path: 'e2e/screenshots/04-file-selected.png',
        fullPage: true
      });

      // Click Upload & Parse button
      const uploadButton = page.getByRole('button', { name: /upload.*parse/i });
      await uploadButton.click();

      // Wait for the preview state (parsing may take a moment)
      // The dialog title should change to "Import Preview"
      await page.waitForSelector('text=Import Preview', { timeout: 30000 }).catch(() => {
        // May have failed - capture error state anyway
      });

      // Wait a bit more for any animations/rendering
      await page.waitForTimeout(1000);

      // Screenshot the preview dialog - this is where we expect to see the bug
      await page.screenshot({
        path: 'e2e/screenshots/05-import-preview-BROKEN.png',
        fullPage: true
      });

      // Also capture just the dialog for a closer look
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible()) {
        await dialog.screenshot({
          path: 'e2e/screenshots/06-import-preview-dialog-BROKEN.png'
        });
      }

      // Capture DOM state for analysis
      const dialogHTML = await dialog.innerHTML().catch(() => 'Could not capture HTML');
      console.log('Dialog HTML:', dialogHTML);

      // Check for any error messages
      const errorAlert = page.locator('[role="alert"]');
      if (await errorAlert.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.screenshot({
          path: 'e2e/screenshots/07-error-state.png',
          fullPage: true
        });
      }

    } else {
      // Capture what we see if Import button not found
      await page.screenshot({
        path: 'e2e/screenshots/ERROR-no-import-button.png',
        fullPage: true
      });
      console.log('Import button not found. Page content:', await page.content());
    }
  });
});
