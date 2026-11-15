import { z } from "zod";
import validate from "./validate.js";

const dateSchema = z
    .string("The date query parameter should be a string")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "The date must use YYYY-MM-DD format")
    .refine((value) => {
        const [year, month, day] = value.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));

        return date.getUTCFullYear() === year
            && date.getUTCMonth() === month - 1
            && date.getUTCDate() === day;
    }, "The date must be a valid calendar date");

const historyQuerySchema = z.object({
    date: dateSchema,
});

const historySearchesQuerySchema = z.object({
    date: dateSchema,
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

const historyTurnParamsSchema = z.object({
    turnId: z
        .string("The turn ID should be a string")
        .trim()
        .min(1, "The turn ID is required")
        .max(200, "The turn ID should not exceed 200 characters"),
});

const searchQuerySchema = z.object({
    q: z
        .string("The search query should be a string")
        .trim()
        .min(1, "The search query is required")
        .max(200, "The search query should not exceed 200 characters"),
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
    role: z.enum(["user", "assistant"], {
        message: "The role must be either user or assistant",
    }).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    conversationId: z
        .string("The conversation ID should be a string")
        .trim()
        .min(1, "The conversation ID cannot be empty")
        .max(200, "The conversation ID should not exceed 200 characters")
        .optional(),
}).superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["to"],
            message: "The end date must be on or after the start date",
        });
    }
});

export const validateHistoryDate = validate(historyQuerySchema, "query");
export const validateHistorySearches = validate(historySearchesQuerySchema, "query");
export const validateHistorySearch = validate(searchQuerySchema, "query");
export const validateHistoryTurn = validate(historyTurnParamsSchema, "params");
