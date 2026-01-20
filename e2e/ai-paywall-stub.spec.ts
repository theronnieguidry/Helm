/**
 * PRD-031: AI Import Paywall Stub E2E Tests
 *
 * Tests the paywall stub dialog that appears when a user without AI features
 * tries to enable the AI Enhance Import toggle.
 */

import { test, expect } from "@playwright/test";

// Mock responses for API endpoints
const mockParseResponse = {
  importPlanId: "test-plan-123",
  summary: {
    totalPages: 10,
    emptyPages: 1,
    characters: 0,
    npcs: 3,
    pois: 2,
    questsOpen: 2,
    questsDone: 1,
    notes: 1,
  },
  pages: [
    { sourcePageId: "1", title: "Lord Gareth", noteType: "npc", isEmpty: false },
    { sourcePageId: "2", title: "Silvertown", noteType: "poi", isEmpty: false },
    { sourcePageId: "3", title: "Find the Dragon", noteType: "quest", questStatus: "active", isEmpty: false },
  ],
};

// Mock team members response - user WITHOUT AI enabled
const mockMembersWithoutAI = [
  {
    id: "member-1",
    teamId: "team-1",
    userId: "user-1",
    role: "dm",
    aiEnabled: false,
    aiEnabledAt: null,
    characterName: null,
    characterType1: null,
    characterType2: null,
    characterDescription: null,
    joinedAt: new Date().toISOString(),
  },
];

// Mock team members response - user WITH AI enabled
const mockMembersWithAI = [
  {
    id: "member-1",
    teamId: "team-1",
    userId: "user-1",
    role: "dm",
    aiEnabled: true,
    aiEnabledAt: new Date().toISOString(),
    characterName: null,
    characterType1: null,
    characterType2: null,
    characterDescription: null,
    joinedAt: new Date().toISOString(),
  },
];

test.describe("AI Import Paywall Stub (PRD-031)", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the auth endpoint
    await page.route("**/api/auth/user", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "user-1",
          email: "test@example.com",
          firstName: "Test",
          lastName: "User",
        }),
      });
    });

    // Mock teams endpoint
    await page.route("**/api/teams", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "team-1",
              name: "Test Campaign",
              teamType: "dnd",
              diceMode: "polyhedral",
              ownerId: "user-1",
            },
          ]),
        });
      }
    });

    // Mock parse endpoint
    await page.route("**/api/teams/**/imports/nuclino/parse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockParseResponse),
      });
    });

    // Mock notes endpoint
    await page.route("**/api/teams/**/notes", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
  });

  test("should show paywall stub when clicking AI toggle without entitlement", async ({ page }) => {
    // Mock members endpoint - user WITHOUT AI enabled
    await page.route("**/api/teams/**/members", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockMembersWithoutAI),
      });
    });

    // Navigate to notes page
    await page.goto("/teams/team-1/notes");

    // Click Import button
    await page.getByRole("button", { name: /Import/i }).click();

    // Upload a mock file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("mock zip content"),
    });

    // Click Upload & Parse
    await page.getByRole("button", { name: /Upload & Parse/i }).click();

    // Wait for preview state
    await expect(page.getByText("Import Preview")).toBeVisible();

    // Find the AI Enhance Import toggle
    const aiToggle = page.locator("#ai-enhance");

    // Click the toggle (user doesn't have AI enabled)
    await aiToggle.click();

    // Verify paywall stub dialog appears
    await expect(page.getByText("Unlock AI-Enhanced Import")).toBeVisible();
    await expect(page.getByText("See what you're missing")).toBeVisible();

    // Verify the real example is shown
    await expect(page.getByText("Hobgoblin Threat to Agnot")).toBeVisible();
    await expect(page.getByText("Pattern Recognition")).toBeVisible();
    await expect(page.getByText("AI Enhanced")).toBeVisible();

    // Verify entities from the example
    await expect(page.getByText("Killgore")).toBeVisible();
    await expect(page.getByText("The Tawdry Tart")).toBeVisible();

    // Verify action buttons
    await expect(page.getByRole("button", { name: /Continue without AI/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Enable AI Features/i })).toBeVisible();
  });

  test("should close paywall stub when clicking 'Continue without AI'", async ({ page }) => {
    // Mock members endpoint - user WITHOUT AI enabled
    await page.route("**/api/teams/**/members", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockMembersWithoutAI),
      });
    });

    await page.goto("/teams/team-1/notes");
    await page.getByRole("button", { name: /Import/i }).click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("mock zip content"),
    });

    await page.getByRole("button", { name: /Upload & Parse/i }).click();
    await expect(page.getByText("Import Preview")).toBeVisible();

    // Click AI toggle to open paywall stub
    await page.locator("#ai-enhance").click();
    await expect(page.getByText("Unlock AI-Enhanced Import")).toBeVisible();

    // Click "Continue without AI"
    await page.getByRole("button", { name: /Continue without AI/i }).click();

    // Verify paywall stub is closed
    await expect(page.getByText("Unlock AI-Enhanced Import")).not.toBeVisible();

    // Verify we're back at import preview
    await expect(page.getByText("Import Preview")).toBeVisible();

    // Verify toggle is still OFF
    const aiToggle = page.locator("#ai-enhance");
    await expect(aiToggle).not.toBeChecked();
  });

  test("should toggle normally when user has AI enabled", async ({ page }) => {
    // Mock members endpoint - user WITH AI enabled
    await page.route("**/api/teams/**/members", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockMembersWithAI),
      });
    });

    await page.goto("/teams/team-1/notes");
    await page.getByRole("button", { name: /Import/i }).click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("mock zip content"),
    });

    await page.getByRole("button", { name: /Upload & Parse/i }).click();
    await expect(page.getByText("Import Preview")).toBeVisible();

    // Click AI toggle - should work normally
    const aiToggle = page.locator("#ai-enhance");
    await aiToggle.click();

    // Paywall stub should NOT appear
    await expect(page.getByText("Unlock AI-Enhanced Import")).not.toBeVisible();

    // Toggle should be ON
    await expect(aiToggle).toBeChecked();
  });

  test("should display confidence badge and relationships in paywall stub", async ({ page }) => {
    // Mock members endpoint - user WITHOUT AI enabled
    await page.route("**/api/teams/**/members", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockMembersWithoutAI),
      });
    });

    await page.goto("/teams/team-1/notes");
    await page.getByRole("button", { name: /Import/i }).click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("mock zip content"),
    });

    await page.getByRole("button", { name: /Upload & Parse/i }).click();
    await expect(page.getByText("Import Preview")).toBeVisible();

    await page.locator("#ai-enhance").click();
    await expect(page.getByText("Unlock AI-Enhanced Import")).toBeVisible();

    // Verify confidence badge (87%)
    await expect(page.getByText("87%")).toBeVisible();

    // Verify Quest badge
    await expect(page.getByText("Quest (bounty contract)")).toBeVisible();

    // Verify relationships section shows "located in" relationship
    await expect(page.getByText("located in")).toBeVisible();

    // Verify statistics banner
    await expect(page.getByText(/improves.*40-60%/i)).toBeVisible();
    await expect(page.getByText(/3-5x.*more entity relationships/i)).toBeVisible();
  });
});
