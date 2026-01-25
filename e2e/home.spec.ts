import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test("should display the Lead Generator heading", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /lead generator/i })
    ).toBeVisible();
    await expect(
      page.getByText(/find b2c business leads/i)
    ).toBeVisible();
  });

  test("should display the search form", async ({ page }) => {
    await page.goto("/");

    // Check for the main form elements
    await expect(page.getByText(/what type of business/i)).toBeVisible();
    await expect(page.getByPlaceholder(/restaurant, hair salon/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /find leads/i })).toBeVisible();
  });

  test("should display the How It Works section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /how it works/i })
    ).toBeVisible();
    await expect(page.getByText(/search the web/i)).toBeVisible();
    await expect(page.getByText(/find contact info/i)).toBeVisible();
    await expect(page.getByText(/export your leads/i)).toBeVisible();
  });

  test("should display example buttons", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/try an example/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /med spa/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /restaurants/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /hair salons/i })).toBeVisible();
  });

  test("should fill form when clicking example button", async ({ page }) => {
    await page.goto("/");

    // Click the "Med Spa" example button
    await page.getByRole("button", { name: /med spa/i }).click();

    // Check that the form was filled
    const queryInput = page.getByPlaceholder(/restaurant, hair salon/i);
    await expect(queryInput).toHaveValue("med spa");
  });
});
