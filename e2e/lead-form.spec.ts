import { test, expect } from "@playwright/test";

test.describe("Lead Capture Form", () => {
  test("should display the form fields", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByLabel(/name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/phone/i)).toBeVisible();
    await expect(page.getByLabel(/company/i)).toBeVisible();
    await expect(page.getByLabel(/message/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send message/i })).toBeVisible();
  });

  test("should show validation errors for empty required fields", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /send message/i }).click();

    // Browser validation should prevent submission
    await expect(page.getByLabel(/name/i)).toBeFocused();
  });

  test("should show validation error for invalid email", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel(/name/i).fill("Test User");
    await page.getByLabel(/email/i).fill("invalid-email");
    await page.getByLabel(/message/i).fill("This is a test message that is long enough.");

    await page.getByRole("button", { name: /send message/i }).click();

    // Browser's native email validation kicks in
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toBeFocused();
  });

  test("should show validation error for short message", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel(/name/i).fill("Test User");
    await page.getByLabel(/email/i).fill("test@example.com");
    await page.getByLabel(/message/i).fill("Short");

    await page.getByRole("button", { name: /send message/i }).click();

    await expect(page.getByText(/at least 10 characters/i)).toBeVisible();
  });

  test("should successfully submit a valid form", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel(/name/i).fill("Test User");
    await page.getByLabel(/email/i).fill("test@example.com");
    await page.getByLabel(/phone/i).fill("555-123-4567");
    await page.getByLabel(/company/i).fill("Test Company");
    await page.getByLabel(/message/i).fill("This is a test message for the lead capture form.");

    await page.getByRole("button", { name: /send message/i }).click();

    await expect(page.getByText(/message sent/i)).toBeVisible();
    await expect(page.getByText(/thank you/i)).toBeVisible();
  });
});
