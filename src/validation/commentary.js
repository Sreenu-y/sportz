import { z } from "zod";

/**
 * Schema for validating query parameters when listing commentary.
 */
export const listCommentaryQuerySchema = z.object({
  limit: z
    .coerce.number()
    .int()
    .positive()
    .max(100)
    .optional(),
});

/**
 * Schema for validating request payload when creating commentary.
 */
export const createCommentarySchema = z.object({
  minute: z
    .coerce.number()
    .int()
    .nonnegative(),
  sequence: z
    .coerce.number()
    .int(),
  period: z
    .string()
    .min(1, "period is required"),
  eventType: z
    .string()
    .min(1, "eventType is required"),
  actor: z
    .string()
    .optional(),
  team: z
    .string()
    .optional(),
  message: z
    .string()
    .min(1, "message is required"),
  metadata: z
    .record(z.string(), z.unknown())
    .optional(),
  tags: z
    .array(z.string())
    .optional(),
});
