import { z } from "zod";
import validate from "./validate.js";

const titleSchema = z
    .string("The title should be a string")
    .trim()
    .min(1, "The title is required")
    .max(200, "The title should not exceed 200 characters");

const timezoneSchema = z.string("The timezone should be a string").refine((value) => {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
        return true;
    } catch {
        return false;
    }
}, "The timezone should be a valid IANA timezone");

export const createConversationSchema = z.object({
    title: titleSchema,
    timeZone: timezoneSchema,
});

export const updateConversationTitleSchema = z.object({
    title: titleSchema,
});

export const validateConversation = validate(createConversationSchema);
export const validateConversationTitle = validate(updateConversationTitleSchema);
