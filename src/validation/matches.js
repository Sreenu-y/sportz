import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MATCH_STATUS = {
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  FINISHED: 'finished',
};

// ---------------------------------------------------------------------------
// Query / Param Schemas
// ---------------------------------------------------------------------------

const listMatchesQuerySchema = z.object({
  limit: z
    .coerce.number()
    .int()
    .positive()
    .max(100)
    .optional(),
});

const matchIdParamSchema = z.object({
  id: z
    .coerce.number()
    .int()
    .positive(),
});

// ---------------------------------------------------------------------------
// Body Schemas
// ---------------------------------------------------------------------------

const createMatchSchema = z
  .object({
    sport: z.string().min(1, 'sport is required'),
    homeTeam: z.string().min(1, 'homeTeam is required'),
    awayTeam: z.string().min(1, 'awayTeam is required'),

    startTime: z
      .string()
      .refine((v) => !isNaN(Date.parse(v)), {
        message: 'startTime must be a valid ISO date string',
      }),

    endTime: z
      .string()
      .refine((v) => !isNaN(Date.parse(v)), {
        message: 'endTime must be a valid ISO date string',
      }),

    homeScore: z
      .coerce.number()
      .int()
      .nonnegative()
      .optional(),

    awayScore: z
      .coerce.number()
      .int()
      .nonnegative()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (new Date(data.endTime) <= new Date(data.startTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime must be after startTime',
      });
    }
  });

const updateScoreSchema = z.object({
  homeScore: z
    .coerce.number()
    .int()
    .nonnegative(),

  awayScore: z
    .coerce.number()
    .int()
    .nonnegative(),
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  MATCH_STATUS,
  listMatchesQuerySchema,
  matchIdParamSchema,
  createMatchSchema,
  updateScoreSchema,
};
