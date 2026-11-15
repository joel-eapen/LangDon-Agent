import {
    findUserById,
    getTurnHistory,
    listHistoricalSearches,
    listMessageDates,
    searchMessages as searchMessagesRepository,
    verifyConversationOwnership,
} from "../db/repositories.js";
import { TINYFISH_SEARCH_TOOL_NAME } from "./conversation-search.service.js";
import ApiError from "../utils/api-error.js";
import {
    MAX_SEARCH_QUERY_LENGTH,
    normalizeSearchQuery,
} from "../utils/search-query.js";

function parseToolArguments(argumentsJson) {
    try {
        return JSON.parse(argumentsJson);
    } catch {
        return null;
    }
}

function queryFromArguments(argumentsJson) {
    const argumentsObject = parseToolArguments(argumentsJson);
    return argumentsObject?.query
        ?? argumentsObject?.q
        ?? argumentsObject?.searchQuery
        ?? null;
}

export function getHistoricalDates(userId) {
    if (!userId) {
        throw new ApiError(401, "Authentication is required", [], "AUTHENTICATION_REQUIRED");
    }

    return {
        dates: listMessageDates(userId).map(({ date, message_count }) => ({
            date,
            messageCount: message_count,
        })),
    };
}

export function getHistoricalSearches({
    userId,
    date,
    page = 1,
    limit = 10,
}) {
    if (!userId) {
        throw new ApiError(401, "Authentication is required", [], "AUTHENTICATION_REQUIRED");
    }

    const user = findUserById(userId);
    if (!user) {
        throw new ApiError(401, "Authenticated user was not found", [], "INVALID_AUTHENTICATION");
    }

    const pageNumber = Math.max(1, page);
    const limitNumber = Math.min(50, Math.max(1, limit));
    const { totalSearches, toolCalls, searchResults } = listHistoricalSearches({
        userId,
        localDate: date,
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
        date,
        timezone: user.timezone,
        totalSearches,
        searches: toolCalls.map((toolCall) => ({
            toolCallId: toolCall.id,
            conversationId: toolCall.conversation_id,
            conversationTitle: toolCall.conversation_title,
            turnId: toolCall.turn_id,
            toolName: toolCall.tool_name,
            query: queryByToolCallId.get(toolCall.id)
                ?? queryFromArguments(toolCall.arguments_json),
            arguments: parseToolArguments(toolCall.arguments_json) ?? toolCall.arguments_json,
            resultSummary: toolCall.result_summary,
            status: toolCall.status,
            startedAt: toolCall.started_at,
            completedAt: toolCall.completed_at,
            durationMs: toolCall.duration_ms,
            results: resultsByToolCallId.get(toolCall.id) ?? [],
        })),
        pagination: {
            page: pageNumber,
            limit: limitNumber,
            totalSearches,
            totalPages: Math.ceil(totalSearches / limitNumber),
        },
    };
}

const emptySearchResponse = (query, page, limit) => ({
    query,
    totalResults: 0,
    results: [],
    pagination: {
        page,
        limit,
        totalResults: 0,
        totalPages: 0,
    },
});

export function searchHistoricalMessages({
    userId,
    query,
    page = 1,
    limit = 10,
    role,
    from,
    to,
    conversationId,
}) {
    if (!userId) {
        throw new ApiError(401, "Authentication is required", [], "AUTHENTICATION_REQUIRED");
    }
    if (typeof query !== "string" || !query.trim()) {
        throw new ApiError(400, "The search query is required", [], "INVALID_REQUEST");
    }
    if (query.trim().length > MAX_SEARCH_QUERY_LENGTH) {
        throw new ApiError(
            400,
            `The search query should not exceed ${MAX_SEARCH_QUERY_LENGTH} characters`,
            [],
            "INVALID_REQUEST",
        );
    }

    const normalized = normalizeSearchQuery(query);
    const pageNumber = Math.max(1, page);
    const limitNumber = Math.min(50, Math.max(1, limit));

    if (!normalized.ftsQuery) {
        return emptySearchResponse(normalized.normalizedQuery, pageNumber, limitNumber);
    }

    if (conversationId && !verifyConversationOwnership(userId, conversationId)) {
        return emptySearchResponse(normalized.normalizedQuery, pageNumber, limitNumber);
    }

    const { totalResults, results } = searchMessagesRepository({
        userId,
        query,
        page: pageNumber,
        limit: limitNumber,
        role,
        from,
        to,
        conversationId,
    });

    return {
        query: normalized.normalizedQuery,
        totalResults,
        results: results.map((result) => ({
            message: {
                id: result.message_id,
                role: result.role,
                content: result.content,
                turnId: result.turn_id,
                timestamp: result.ts_utc,
                localDate: result.local_date,
            },
            conversation: {
                id: result.conversation_id,
                title: result.conversation_title,
            },
            matchedText: result.matched_text,
            relevance: result.relevance,
        })),
        pagination: {
            page: pageNumber,
            limit: limitNumber,
            totalResults,
            totalPages: Math.ceil(totalResults / limitNumber),
        },
    };
}

export function getHistoricalTurn({ userId, turnId }) {
    if (!userId) {
        throw new ApiError(401, "Authentication is required", [], "AUTHENTICATION_REQUIRED");
    }

    const { messages, toolCalls, searchResults } = getTurnHistory(userId, turnId);
    if (messages.length === 0 && toolCalls.length === 0 && searchResults.length === 0) {
        throw new ApiError(404, "Turn not found", [], "RESOURCE_NOT_FOUND");
    }

    const eventOrder = {
        message: 0,
        tool_call: 1,
        search_result: 2,
    };
    const events = [
        ...messages.map((message) => ({
            type: "message",
            timestamp: message.ts_utc,
            data: message,
        })),
        ...toolCalls.map((toolCall) => ({
            type: "tool_call",
            timestamp: toolCall.started_at,
            data: toolCall,
        })),
        ...searchResults.map((searchResult) => ({
            type: "search_result",
            timestamp: searchResult.retrieved_at,
            data: searchResult,
        })),
    ].sort((first, second) =>
        first.timestamp.localeCompare(second.timestamp)
        || eventOrder[first.type] - eventOrder[second.type]
    );

    return {
        turnId,
        messages,
        toolCalls,
        searchResults,
        events,
    };
}
