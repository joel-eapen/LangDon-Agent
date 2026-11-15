import { Router } from "express";
import {
    createConvo,
    getAllConvo,
    getConversationSearchHistory,
    getOneConvo,
    updateTitle,
} from "../controllers/convo.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateConversation, validateConversationTitle } from "../validators/convo.validator.js";
import {
    validateConversationSearchId,
    validateConversationSearchQuery,
} from "../validators/conversation-search.validator.js";

const router = Router();

router.post(
    "/",
    authenticate,
    validateConversation,
    createConvo,
);

router.get(
    "/",
    authenticate,
    getAllConvo
);

router.patch(
    "/:id/title",
    authenticate,
    validateConversationTitle,
    updateTitle
);

router.get(
    "/:id/searches",
    authenticate,
    validateConversationSearchId,
    validateConversationSearchQuery,
    getConversationSearchHistory
);

router.get(
    "/:id",
    authenticate,
    getOneConvo
)

export default router;
