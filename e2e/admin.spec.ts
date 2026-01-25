import { test, expect } from "@playwright/test";

test.describe("Admin Dashboard", () => {
  test("should show login form when not authenticated", async ({ page }) => {
    await page.goto("/admin");

    // Wait for page to load and check for login heading
    await expect(
      page.getByRole("heading", { name: /admin login/i })
    ).toBeVisible({ timeout: 10000 });

    // Check for password input
    await expect(page.getByPlaceholder(/enter admin password/i)).toBeVisible();

    // Check for login button
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
  });

  test("should show error for invalid password", async ({ page }) => {
    await page.goto("/admin");

    // Wait for login form
    await expect(page.getByPlaceholder(/enter admin password/i)).toBeVisible({ timeout: 10000 });

    // Fill in wrong password
    await page.getByPlaceholder(/enter admin password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /login/i }).click();

    // Should show error (either "invalid" or generic error)
    await expect(
      page.getByText(/invalid/i).or(page.getByText(/error/i)).or(page.getByText(/incorrect/i))
    ).toBeVisible({ timeout: 10000 });
  });

  // Note: These tests require ADMIN_PASSWORD env var and database connection
  test("should login with correct password", async ({ page }) => {
    await page.goto("/admin");

    await page.getByPlaceholder(/enter admin password/i).fill(process.env.ADMIN_PASSWORD || "admin123");
    await page.getByRole("button", { name: /login/i }).click();

    await expect(
      page.getByRole("heading", { name: /admin dashboard/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test("should display leads table after login", async ({ page }) => {
    await page.goto("/admin");

    await page.getByPlaceholder(/enter admin password/i).fill(process.env.ADMIN_PASSWORD || "admin123");
    await page.getByRole("button", { name: /login/i }).click();

    await expect(page.getByRole("heading", { name: /admin dashboard/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /export/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /logout/i })).toBeVisible();
  });

  test("should show date filter controls", async ({ page }) => {
    await page.goto("/admin");

    await page.getByPlaceholder(/enter admin password/i).fill(process.env.ADMIN_PASSWORD || "admin123");
    await page.getByRole("button", { name: /login/i }).click();

    await expect(page.getByText(/start date/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/end date/i)).toBeVisible();
  });

  test("should logout successfully", async ({ page }) => {
    await page.goto("/admin");

    await page.getByPlaceholder(/enter admin password/i).fill(process.env.ADMIN_PASSWORD || "admin123");
    await page.getByRole("button", { name: /login/i }).click();

    await expect(
      page.getByRole("heading", { name: /admin dashboard/i })
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /logout/i }).click();

    await expect(
      page.getByRole("heading", { name: /admin login/i })
    ).toBeVisible({ timeout: 10000 });
  });
});
