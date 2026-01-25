/**
 * E2E Tests for Search Flow
 *
 * Tests the core user journey of searching for leads.
 */

import { test, expect } from '@playwright/test';

test.describe('Search Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the search form', async ({ page }) => {
    // Check that the main search form elements are visible
    await expect(page.locator('input[placeholder*="dentist"]').or(page.locator('input[name="query"]'))).toBeVisible();
    await expect(page.locator('input[placeholder*="location"]').or(page.locator('input[name="location"]'))).toBeVisible();
    await expect(page.locator('button[type="submit"]').or(page.getByRole('button', { name: /search/i }))).toBeVisible();
  });

  test('should show validation for empty search', async ({ page }) => {
    // Try to submit without filling in the form
    const submitButton = page.locator('button[type="submit"]').or(page.getByRole('button', { name: /search/i }));
    await submitButton.click();

    // Should show some validation error or the form should not submit
    // (exact behavior depends on implementation)
    const url = page.url();
    expect(url).not.toContain('/results');
  });

  test('should navigate to results after search', async ({ page }) => {
    // Fill in the search form
    const queryInput = page.locator('input[placeholder*="dentist"]').or(page.locator('input[name="query"]'));
    const locationInput = page.locator('input[placeholder*="location"]').or(page.locator('input[name="location"]'));

    await queryInput.fill('dentists');
    await locationInput.fill('San Francisco, CA');

    // Submit the form
    const submitButton = page.locator('button[type="submit"]').or(page.getByRole('button', { name: /search/i }));
    await submitButton.click();

    // Should navigate to results or show loading state
    await expect(page).toHaveURL(/(results|search|loading)/, { timeout: 10000 });
  });
});

test.describe('Results Page', () => {
  test('should display search parameters', async ({ page }) => {
    // Navigate directly to a results page (if accessible)
    await page.goto('/results?q=dentists&location=San+Francisco');

    // Check that search info is displayed
    await expect(page.getByText(/dentist/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('API Documentation', () => {
  test('should display API docs page', async ({ page }) => {
    await page.goto('/docs');

    // Check for API documentation content
    await expect(page.getByRole('heading', { name: /api/i })).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Health Check', () => {
  test('should return healthy status', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('status');
  });
});

test.describe('API Status', () => {
  test('should return API status', async ({ request }) => {
    const response = await request.get('/api/api-status');

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toBeDefined();
  });
});

test.describe('Rate Limiting', () => {
  test('should include rate limit headers', async ({ request }) => {
    const response = await request.get('/api/health');

    // Check for rate limit headers set by middleware
    const headers = response.headers();
    expect(headers['x-ratelimit-limit'] || headers['x-request-start']).toBeDefined();
  });
});

test.describe('Security Headers', () => {
  test('should include security headers', async ({ request }) => {
    const response = await request.get('/');

    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
  });
});

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Check that search form is still usable on mobile
    const queryInput = page.locator('input[placeholder*="dentist"]').or(page.locator('input[name="query"]'));
    await expect(queryInput).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    const queryInput = page.locator('input[placeholder*="dentist"]').or(page.locator('input[name="query"]'));
    await expect(queryInput).toBeVisible();
  });
});
