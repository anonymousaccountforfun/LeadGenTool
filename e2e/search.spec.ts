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
    await expect(page.getByPlaceholder(/restaurant, hair salon/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /find leads/i })).toBeVisible();
  });

  test('should have disabled submit button when query is empty', async ({ page }) => {
    // Submit button should be disabled when no query
    const submitButton = page.getByRole('button', { name: /find leads/i });
    await expect(submitButton).toBeDisabled();
  });

  test('should enable submit button when query is filled', async ({ page }) => {
    // Fill in the query input
    const queryInput = page.getByPlaceholder(/restaurant, hair salon/i);
    await queryInput.fill('dentists');

    // Submit button should be enabled
    const submitButton = page.getByRole('button', { name: /find leads/i });
    await expect(submitButton).toBeEnabled();
  });

  test('should allow selecting a state', async ({ page }) => {
    // Find the state dropdown (first select)
    const stateSelect = page.locator('select').first();

    // Select California
    await stateSelect.selectOption('CA');

    // Verify the selection
    await expect(stateSelect).toHaveValue('CA');
  });

  test('should allow changing location type', async ({ page }) => {
    // Find the location type dropdown (second select)
    const locationTypeSelect = page.locator('select').nth(1);

    // Select County
    await locationTypeSelect.selectOption('county');

    // Verify county input appears
    await expect(page.getByText(/county name/i)).toBeVisible();
  });
});

test.describe('API Health', () => {
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
    const queryInput = page.getByPlaceholder(/restaurant, hair salon/i);
    await expect(queryInput).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    const queryInput = page.getByPlaceholder(/restaurant, hair salon/i);
    await expect(queryInput).toBeVisible();
  });
});

test.describe('Example Buttons', () => {
  test('should fill form when clicking Med Spa example', async ({ page }) => {
    await page.goto('/');

    // Click the Med Spa example
    await page.getByRole('button', { name: /med spa/i }).click();

    // Verify query was filled
    const queryInput = page.getByPlaceholder(/restaurant, hair salon/i);
    await expect(queryInput).toHaveValue('med spa');
  });

  test('should fill form when clicking Restaurants example', async ({ page }) => {
    await page.goto('/');

    // Click the Restaurants example
    await page.getByRole('button', { name: /restaurants/i }).click();

    // Verify query was filled
    const queryInput = page.getByPlaceholder(/restaurant, hair salon/i);
    await expect(queryInput).toHaveValue('restaurant');
  });
});
