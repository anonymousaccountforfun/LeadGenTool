"use client";

import { useActionState } from "react";
import { submitLead } from "@/lib/actions/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LeadFormState } from "@/types/lead";

const initialState: LeadFormState = {
  success: false,
  message: "",
};

export function LeadCaptureForm() {
  const [state, formAction, isPending] = useActionState(submitLead, initialState);

  if (state.success) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Message Sent!
        </h3>
        <p className="text-gray-600">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state.message && !state.success && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {state.message}
        </div>
      )}

      <Input
        name="name"
        label="Name *"
        placeholder="Your name"
        required
        error={state.errors?.name?.[0]}
      />

      <Input
        name="email"
        type="email"
        label="Email *"
        placeholder="you@example.com"
        required
        error={state.errors?.email?.[0]}
      />

      <Input
        name="phone"
        type="tel"
        label="Phone"
        placeholder="(555) 123-4567"
        error={state.errors?.phone?.[0]}
      />

      <Input
        name="company"
        label="Company"
        placeholder="Your company name"
        error={state.errors?.company?.[0]}
      />

      <Textarea
        name="message"
        label="Message *"
        placeholder="Tell us about your needs..."
        rows={4}
        required
        error={state.errors?.message?.[0]}
      />

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? "Sending..." : "Send Message"}
      </Button>
    </form>
  );
}
