import { z } from "zod";
import validate from "./validate.js";

const messageSchema = z.object({
    role: z.enum(["user", "assistant", "system"], {
        message: "The role must be user, assistant, or system",
    }),
    content: z
        .string("The content should be a string")
        .trim()
        .min(1, "The content is required"),
    turn_id: z
        .string("The turn_id should be a string")
        .trim()
        .min(1, "The turn_id is required"),
});

export const validateMessage = validate(messageSchema);
