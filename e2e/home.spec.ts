import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("should display the hero section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /grow your business/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /get started today/i })
    ).toBeVisible();
  });

  test("should display the features section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /everything you need/i })
    ).toBeVisible();
    await expect(page.getByText(/easy lead capture/i)).toBeVisible();
    await expect(page.getByText(/real-time notifications/i)).toBeVisible();
    await expect(page.getByText(/powerful analytics/i)).toBeVisible();
    await expect(page.getByText(/export to csv/i)).toBeVisible();
  });

  test("should display the contact section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /get in touch/i })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /contact us/i })).toBeVisible();
  });

  test("should navigate to contact section when clicking CTA", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /get started today/i }).click();
    await expect(page).toHaveURL("/#contact");
  });
});
