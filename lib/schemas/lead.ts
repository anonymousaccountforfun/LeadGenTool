import { z } from "zod";

export const leadFormSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters"),
  email: z
    .string()
    .email("Please enter a valid email address"),
  phone: z
    .string()
    .regex(/^[\d\s\-+()]*$/, "Phone number can only contain digits, spaces, dashes, parentheses, and +")
    .refine(
      (val) => !val || (val.replace(/\D/g, "").length >= 7 && val.replace(/\D/g, "").length <= 15),
      "Phone number must contain between 7 and 15 digits"
    )
    .optional()
    .or(z.literal("")),
  company: z
    .string()
    .max(200, "Company name must be less than 200 characters")
    .optional()
    .or(z.literal("")),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message must be less than 2000 characters"),
});

export type LeadFormInput = z.infer<typeof leadFormSchema>;
