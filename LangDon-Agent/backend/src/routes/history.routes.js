import { Router } from "express";
import {
    historyByDate,
    historyDates,
    historyBySearch,
    historySearches,
    historyByTurnId,
} from "../controllers/history.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import {
    validateHistoryDate,
    validateHistorySearch,
    validateHistorySearches,
    validateHistoryTurn,
} from "../validators/history.validator.js";

const router = Router();

router.get(
    "/search",
    authenticate,
    validateHistorySearch,
    historyBySearch
);

router.get(
    "/dates",
    authenticate,
    historyDates
);

router.get(
    "/searches",
    authenticate,
    validateHistorySearches,
    historySearches
);

router.get(
    "/turns/:turnId",
    authenticate,
    validateHistoryTurn,
    historyByTurnId
);

router.get(
    "/",
    authenticate,
    validateHistoryDate,
    historyByDate
);

export default router;
