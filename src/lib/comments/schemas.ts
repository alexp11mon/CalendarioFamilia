import { z } from "zod";
import { COMMENT_MESSAGES } from "./error-messages";
import { MAX_COMMENT_LENGTH } from "./limits";

/**
 * Text of a comment: the ends trimmed, inner line breaks kept (RF-9). Counted
 * in code points like Postgres' char_length, so an emoji is one (RF-10).
 */
export const commentBodySchema = z
  .string()
  .trim()
  .min(1, COMMENT_MESSAGES.empty)
  .refine((text) => [...text].length <= MAX_COMMENT_LENGTH, {
    message: COMMENT_MESSAGES.tooLong,
  });
