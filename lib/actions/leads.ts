"use server";

import { leadFormSchema } from "@/lib/schemas/lead";
import { saveLead } from "@/lib/storage/leads";
import { LeadFormState } from "@/types/lead";
import { validatePassword, createSession, destroySession } from "@/lib/auth/simple-auth";

export async function submitLead(
  prevState: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const rawData = {
    name: formData.get("name") as string,
    email: formData.get("email") as string,
    phone: formData.get("phone") as string,
    company: formData.get("company") as string,
    message: formData.get("message") as string,
  };

  const result = leadFormSchema.safeParse(rawData);

  if (!result.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as string;
      if (!errors[field]) {
        errors[field] = [];
      }
      errors[field].push(issue.message);
    }

    return {
      success: false,
      message: "Please fix the errors below.",
      errors: errors as LeadFormState["errors"],
    };
  }

  try {
    await saveLead({
      name: result.data.name,
      email: result.data.email,
      phone: result.data.phone || undefined,
      company: result.data.company || undefined,
      message: result.data.message,
      source: "landing-page",
    });

    return {
      success: true,
      message: "Thank you! We'll be in touch soon.",
    };
  } catch (error) {
    console.error("Failed to save lead:", error);
    return {
      success: false,
      message: "Something went wrong. Please try again.",
    };
  }
}

export async function loginAction(
  prevState: { success: boolean; message: string },
  formData: FormData
): Promise<{ success: boolean; message: string }> {
  const password = formData.get("password") as string;

  if (!password) {
    return { success: false, message: "Password is required." };
  }

  const isValid = await validatePassword(password);

  if (!isValid) {
    return { success: false, message: "Invalid password." };
  }

  await createSession();
  return { success: true, message: "Login successful." };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
}
