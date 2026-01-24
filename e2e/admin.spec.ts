import { test, expect } from "@playwright/test";

test.describe("Admin Dashboard", () => {
  test("should show login form when not authenticated", async ({ page }) => {
    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: /admin login/i })
    ).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
  });

  test("should show error for invalid password", async ({ page }) => {
    await page.goto("/admin");

    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /login/i }).click();

    await expect(page.getByText(/invalid password/i)).toBeVisible();
  });

  test("should login with correct password", async ({ page }) => {
    await page.goto("/admin");

    await page.getByLabel(/password/i).fill("admin123");
    await page.getByRole("button", { name: /login/i }).click();

    await expect(
      page.getByRole("heading", { name: /admin dashboard/i })
    ).toBeVisible();
  });

  test("should display leads table after login", async ({ page }) => {
    await page.goto("/admin");

    await page.getByLabel(/password/i).fill("admin123");
    await page.getByRole("button", { name: /login/i }).click();

    await expect(page.getByRole("heading", { name: /admin dashboard/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /export csv/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /logout/i })).toBeVisible();
  });

  test("should show date filter controls", async ({ page }) => {
    await page.goto("/admin");

    await page.getByLabel(/password/i).fill("admin123");
    await page.getByRole("button", { name: /login/i }).click();

    await expect(page.getByLabel(/start date/i)).toBeVisible();
    await expect(page.getByLabel(/end date/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^filter$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /clear/i })).toBeVisible();
  });

  test("should logout successfully", async ({ page }) => {
    await page.goto("/admin");

    await page.getByLabel(/password/i).fill("admin123");
    await page.getByRole("button", { name: /login/i }).click();

    await expect(
      page.getByRole("heading", { name: /admin dashboard/i })
    ).toBeVisible();

    await page.getByRole("button", { name: /logout/i }).click();

    await expect(
      page.getByRole("heading", { name: /admin login/i })
    ).toBeVisible();
  });
});
