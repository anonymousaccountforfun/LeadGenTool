import { test, expect } from "@playwright/test";

test.describe("Search Form", () => {
  test("should display all form fields", async ({ page }) => {
    await page.goto("/");

    // Business type query input
    await expect(page.getByPlaceholder(/restaurant, hair salon/i)).toBeVisible();

    // State dropdown
    await expect(page.getByText(/^state$/i)).toBeVisible();

    // Search by dropdown (city/county/radius)
    await expect(page.getByText(/search by/i)).toBeVisible();

    // Number of leads dropdown
    await expect(page.getByText(/number of leads/i)).toBeVisible();

    // Submit button
    await expect(page.getByRole("button", { name: /find leads/i })).toBeVisible();
  });

  test("should show advanced filters when clicked", async ({ page }) => {
    await page.goto("/");

    // Click advanced filters toggle
    await page.getByRole("button", { name: /advanced filters/i }).click();

    // Check that advanced options are visible
    await expect(page.getByText(/industry category/i)).toBeVisible();
    await expect(page.getByText(/company size/i)).toBeVisible();
    await expect(page.getByText(/consumer businesses only/i)).toBeVisible();
  });

  test("should have state dropdown with all US states", async ({ page }) => {
    await page.goto("/");

    // Find and click the state dropdown
    const stateSelect = page.locator('select').first();
    await expect(stateSelect).toBeVisible();

    // Check for some state options
    await expect(stateSelect.locator('option', { hasText: 'California' })).toBeAttached();
    await expect(stateSelect.locator('option', { hasText: 'Texas' })).toBeAttached();
    await expect(stateSelect.locator('option', { hasText: 'New York' })).toBeAttached();
  });

  test("should have location type options", async ({ page }) => {
    await page.goto("/");

    // The second select is the location type
    const locationTypeSelect = page.locator('select').nth(1);
    await expect(locationTypeSelect).toBeVisible();

    // Verify we can select different location types
    await locationTypeSelect.selectOption('city');
    await expect(locationTypeSelect).toHaveValue('city');

    await locationTypeSelect.selectOption('county');
    await expect(locationTypeSelect).toHaveValue('county');

    await locationTypeSelect.selectOption('radius');
    await expect(locationTypeSelect).toHaveValue('radius');
  });

  test("should show city input when City is selected", async ({ page }) => {
    await page.goto("/");

    // City should be selected by default
    await expect(page.getByPlaceholder(/austin, miami/i)).toBeVisible();
  });

  test("should show county input when County is selected", async ({ page }) => {
    await page.goto("/");

    // Select County from the dropdown
    const locationTypeSelect = page.locator('select').nth(1);
    await locationTypeSelect.selectOption('county');

    // Check for county-specific input
    await expect(page.getByText(/county name/i)).toBeVisible();
    await expect(page.getByPlaceholder(/nassau, orange, cook/i)).toBeVisible();
  });

  test("should show radius options when Radius is selected", async ({ page }) => {
    await page.goto("/");

    // Select Radius from the dropdown
    const locationTypeSelect = page.locator('select').nth(1);
    await locationTypeSelect.selectOption('radius');

    // Check for radius-specific options
    await expect(page.getByText(/center city/i)).toBeVisible();
    await expect(page.getByText(/search radius/i)).toBeVisible();
    await expect(page.getByPlaceholder(/hicksville, garden city/i)).toBeVisible();
  });

  test("should disable submit when query is empty", async ({ page }) => {
    await page.goto("/");

    const submitButton = page.getByRole("button", { name: /find leads/i });

    // Button should be disabled when query is empty
    await expect(submitButton).toBeDisabled();
  });

  test("should enable submit when query is filled", async ({ page }) => {
    await page.goto("/");

    // Fill in the query
    await page.getByPlaceholder(/restaurant, hair salon/i).fill("dentist");

    const submitButton = page.getByRole("button", { name: /find leads/i });

    // Button should be enabled
    await expect(submitButton).toBeEnabled();
  });
});
