import { z } from "zod";
import validate from "./validate.js";

const conversationIdSchema = z
    .string("The conversation ID should be a string")
    .trim()
    .min(1, "The conversation ID is required")
    .max(200, "The conversation ID should not exceed 200 characters");

const conversationSearchQuerySchema = z.object({
    page: z.coerce
        .number("The page should be a number")
        .int("The page should be an integer")
        .positive("The page must be greater than zero")
        .default(1),
    limit: z.coerce
        .number("The limit should be a number")
        .int("The limit should be an integer")
        .positive("The limit must be greater than zero")
        .max(50, "The limit must not exceed 50")
        .default(10),
});

export const validateConversationSearchId = validate(
    z.object({ id: conversationIdSchema }),
    "params",
);
export const validateConversationSearchQuery = validate(
    conversationSearchQuerySchema,
    "query",
);
