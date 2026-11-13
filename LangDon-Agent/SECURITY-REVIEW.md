# Security Review

Reviewed: 2026-11-14

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟡 MEDIUM | `backend/src/controllers/convo.controller.js` | 41 | Undefined `parent(limit)` causes every authenticated conversation-list request to return HTTP 500. | 10/10 |
| 2 | ⚪ LOW | `backend/src/controllers/convo.controller.js` | 58 | Pagination passes `limitNumber` instead of the repository's expected `limit`, so the requested limit is ignored; `total` only reflects the current page. | 10/10 |
| 3 | 🟡 MEDIUM | `backend/src/controllers/convo.controller.js` | 88-90 | Inverted user existence check rejects valid authenticated users from retrieving conversations. | 10/10 |
| 4 | ⚪ LOW | `backend/src/controllers/convo.controller.js` | 99-110 | Uses `findConversationById()`, which does not provide `message_count`; the conversation summary repository function is not used. | 10/10 |

## Recommendations

1. Replace `parent(limit)` with validated numeric parsing.
2. Pass the repository's expected `limit` option and calculate total conversations independently if full pagination totals are required.
3. Reject only when the authenticated user lookup returns no user.
4. Use the conversation summary repository function when returning conversation metadata.

No direct cross-user conversation disclosure or unauthorized title update was identified.
