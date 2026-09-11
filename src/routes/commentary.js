import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/db.js";
import { commentary } from "../db/schema.js";
import { matchIdParamSchema } from "../validation/matches.js";
import {
  createCommentarySchema,
  listCommentaryQuerySchema,
} from "../validation/commentary.js";

export const commentaryRouter = Router({ mergeParams: true });

const MAX_LIMIT = 100;

/**
 * GET route to list commentary entries for a match.
 * Validates matchId in req.params and limit in req.query.
 */
commentaryRouter.get("/", async (req, res) => {
  try {
    const paramParsed = matchIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      return res.status(400).json({
        message: "Invalid route parameters",
        errors: paramParsed.error.issues,
      });
    }

    const queryParsed = listCommentaryQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return res.status(400).json({
        message: "Invalid query parameters",
        errors: queryParsed.error.issues,
      });
    }

    const matchId = paramParsed.data.id;
    const limit = Math.min(queryParsed.data.limit ?? MAX_LIMIT, MAX_LIMIT);

    const data = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, matchId))
      .orderBy(desc(commentary.createdAt))
      .limit(limit);

    return res.status(200).json({ data });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch commentary entries",
      details: error.message,
    });
  }
});

/**
 * POST route to create a commentary entry for a match.
 * Validates matchId in req.params and payload in req.body.
 */
commentaryRouter.post("/", async (req, res) => {
  try {
    const paramParsed = matchIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      return res.status(400).json({
        message: "Invalid route parameters",
        errors: paramParsed.error.issues,
      });
    }

    const bodyParsed = createCommentarySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({
        message: "Validation Error",
        errors: bodyParsed.error.issues,
      });
    }

    const matchId = paramParsed.data.id;

    const [insertedCommentary] = await db
      .insert(commentary)
      .values({
        matchId,
        ...bodyParsed.data,
      })
      .returning();

    if (res.app.locals.broadcastCommentary) {
      res.app.locals.broadcastCommentary(
        insertedCommentary.matchId,
        insertedCommentary,
      );
    }

    return res.status(201).json({ data: insertedCommentary });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to create commentary entry",
      details: error.message,
    });
  }
});

export default commentaryRouter;
