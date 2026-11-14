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

export const validateHistoryDate = validate(historyQuerySchema, "query");
