import { Router } from "express";
import { validateMessage } from "../validators/message.validator";
import { authenticate } from "../middleware/authenticate.js";
import { addMessage,getAllMessages, getOneMessage } from "../controllers/message.controller.js";

const router = Router();

router.post(
    "/conversations/:id/messages",
    authenticate,
    validateMessage,
    addMessage
);

router.get(
    "/conversations/:id/messages",
    authenticate,
    getAllMessages

);

router.get(
    "/messages/:id",
    authenticate,
    getOneMessage
)

export default router