import {
    findUserById,
    listMessagesByLocalDate,
    listToolCallsByTurn,
    listSearchResultsByToolCall,
    getTurnHistory,
} from "../db/repositories.js"
import {
    getHistoricalDates,
    getHistoricalSearches,
    searchHistoricalMessages,
} from "../services/history.service.js";
import asyncHandler from "../utils/async-handler.js";
import ApiError from "../utils/api-error.js";
import ApiResponse from "../utils/api-response.js";

const historyByDate = asyncHandler((req,res)=>{
    const{date} = req.query
    if(!date){
        throw new ApiError(400,"Invalid query params")
    }
    const userId = req.auth?.userId;
    if(!userId){
        throw new ApiError(401,"Authentication is required",[],"AUTHENTICATION_REQUIRED")
    }

    const messages = listMessagesByLocalDate(userId,date)
    if(messages.length === 0){
        throw new ApiError(404,"No messages found",[],"RESOURCE_NOT_FOUND")
    }

    const turnIds = [...new Set(messages.map(message => message.turn_id))];

    const toolCalls = turnIds.flatMap(turnId =>{
        return listToolCallsByTurn(turnId)
    })
    
    const toolCallIds = [...new Set(toolCalls.map(toolCall => toolCall.id))]

    const searchResults = toolCallIds.flatMap(toolCallId =>{
        return listSearchResultsByToolCall(toolCallId)
    })

    return res.json(new ApiResponse(200,{
        date,
        messages,
        toolCalls,
        searchResults
    },"History retrieved successfully"))
});

const historyDates = asyncHandler((req, res) => {
    const data = getHistoricalDates(req.auth?.userId);
    return res.json(new ApiResponse(200, data, "History dates retrieved successfully"));
});

const historySearches = asyncHandler((req, res) => {
    const data = getHistoricalSearches({
        userId: req.auth?.userId,
        date: req.query.date,
        page: req.query.page,
        limit: req.query.limit,
    });

    return res.json(new ApiResponse(200, data, "Historical searches retrieved successfully"));
});

const historyBySearch = asyncHandler((req,res)=>{
    const { q, page, limit, role, from, to, conversationId } = req.query;
    const data = searchHistoricalMessages({
        userId: req.auth?.userId,
        query: q,
        page,
        limit,
        role,
        from,
        to,
        conversationId,
    });

    return res.json(new ApiResponse(200, data, "History search completed successfully"));
});

const historyByTurnId = asyncHandler((req,res)=>{
    const { turnId } = req.params;
    const userId = req.auth?.userId;
    if(!userId){
        throw new ApiError(401,"Authentication is required",[],"AUTHENTICATION_REQUIRED")
    }

    const { messages, toolCalls, searchResults } = getTurnHistory(userId, turnId);
    if(messages.length === 0 && toolCalls.length === 0 && searchResults.length === 0){
        throw new ApiError(404,"Turn not found",[],"RESOURCE_NOT_FOUND")
    }

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
        || first.type.localeCompare(second.type)
    );

    return res.json(new ApiResponse(200, {
        turnId,
        messages,
        toolCalls,
        searchResults,
        events,
    }, "Turn history retrieved successfully"));
});

export {
    historyByDate,
    historyDates,
    historySearches,
    historyBySearch,
    historyByTurnId,
}