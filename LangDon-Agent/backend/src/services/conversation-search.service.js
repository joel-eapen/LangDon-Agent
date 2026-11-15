import {
    listConversationSearches,
    verifyConversationOwnership,
} from "../db/repositories.js";
import ApiError from "../utils/api-error.js";

export const TINYFISH_SEARCH_TOOL_NAME = "tinyfish_search";

function parseArguments(argumentsJson) {
    try {
        return JSON.parse(argumentsJson);
    } catch {
        return null;
    }
}

function extractQuery(argumentsJson) {
    const argumentsObject = parseArguments(argumentsJson);
    return argumentsObject?.query
        ?? argumentsObject?.q
        ?? argumentsObject?.searchQuery
        ?? null;
}

export function getConversationSearches({
    userId,
    conversationId,
    page = 1,
    limit = 10,
}) {
    if (!userId) {
        throw new ApiError(401, "Authentication is required", [], "AUTHENTICATION_REQUIRED");
    }

    if (!verifyConversationOwnership(userId, conversationId)) {
        throw new ApiError(404, "Conversation not found", [], "RESOURCE_NOT_FOUND");
    }

    const pageNumber = Math.max(1, page);
    const limitNumber = Math.min(50, Math.max(1, limit));
    const { totalSearches, toolCalls, searchResults } = listConversationSearches({
        userId,
        conversationId,
        toolName: TINYFISH_SEARCH_TOOL_NAME,
        page: pageNumber,
        limit: limitNumber,
    });
    const resultsByToolCallId = new Map();
    const queryByToolCallId = new Map();

    for (const result of searchResults) {
        if (!queryByToolCallId.has(result.tool_call_id)) {
            queryByToolCallId.set(result.tool_call_id, result.query);
        }
        const results = resultsByToolCallId.get(result.tool_call_id) ?? [];
        results.push({
            id: result.id,
            title: result.title,
            url: result.url,
            snippet: result.snippet,
            sourceDomain: result.source_domain,
            publishedAt: result.published_at,
            retrievedAt: result.retrieved_at,
        });
        resultsByToolCallId.set(result.tool_call_id, results);
    }

    return {
        conversationId,
        totalSearches,
        searches: toolCalls.map((toolCall) => {
            const associatedResults = resultsByToolCallId.get(toolCall.id) ?? [];
            const query = queryByToolCallId.get(toolCall.id)
                ?? extractQuery(toolCall.arguments_json);

            return {
                toolCallId: toolCall.id,
                conversationId: toolCall.conversation_id,
                turnId: toolCall.turn_id,
                toolName: toolCall.tool_name,
                query: query ?? null,
                arguments: parseArguments(toolCall.arguments_json) ?? toolCall.arguments_json,
                resultSummary: toolCall.result_summary,
                status: toolCall.status,
                startedAt: toolCall.started_at,
                completedAt: toolCall.completed_at,
                durationMs: toolCall.duration_ms,
                results: associatedResults,
            };
        }),
        pagination: {
            page: pageNumber,
            limit: limitNumber,
            totalSearches,
            totalPages: Math.ceil(totalSearches / limitNumber),
        },
    };
}
