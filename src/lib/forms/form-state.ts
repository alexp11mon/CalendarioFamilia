import type { z } from "zod";
import type { UndoToken } from "@/lib/calendar/undo";

// Generic result of the spec 002 Server Actions (plan "Estado de las Server Actions").
// The auth forms keep their own state types in lib/auth/form-state.ts.
export type { FormAction } from "@/lib/auth/form-state";

export interface FormState<Field extends string> {
  fieldErrors?: Partial<Record<Field, string>>;
  formError?: string;
  /** What the user typed, so a failed submit does not lose it. */
  values: Record<Field, string>;
  /** Success inside the event window, which closes itself instead of redirecting (spec 008 RF-8). */
  done?: Done;
  /** The new event, when the form still has images to upload (spec 012 RF-7). */
  eventId?: string;
  /** What a change to a series would lose, before it is confirmed (spec 013 RF-19, RF-24b). */
  loss?: Loss;
}

export interface Loss {
  exceptions: number;
  images: number;
  /** Comments of the exceptions that go (spec 014 plan D6). */
  comments?: number;
}

/** "gone": deleted in Google while it was being changed (spec 009 RF-25). */
// "goneIcloud": the same, in iCloud (spec 018 RF-48).
export type Done = "created" | "updated" | "deleted" | "gone" | "goneIcloud";

/** Result of a confirm-and-act Server Action (delete, merge): only an error comes back. */
export interface ConfirmState {
  formError?: string;
  done?: Done;
  loss?: Loss;
  /** How to undo a deletion from the notice (spec 017 RF-25). */
  undo?: UndoToken;
}

export type ParseResult<Data, Field extends string> =
  | { ok: true; data: Data }
  | { ok: false; fieldErrors: Partial<Record<Field, string>> };

/** First message per field of a zod error. */
export function fieldErrorsFromZod<Field extends string>(
  error: z.ZodError,
): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]) as Field;
    errors[field] ??= issue.message;
  }
  return errors;
}

export function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
