import {
    completeToolCall,
    createToolCall,
    insertSearchResult,
    updateToolCallStatus,
} from "../../db/repositories.js";
import tinyfish from '../../config/tinyfish.js';
import logger from '../../utils/logger.js';
import { describeTinyFishError } from '../../utils/tinyfish-error.utils.js';

async function searchWeb({ userId, conversationId, messageId, turnId, query }) {
    //Create a tool_call in the DB before contacting the TinyFish
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const toolCall = createToolCall({
        conversationId,
        messageId,
        turnId,
        toolName:'tinyfish_search_tool',
        argumentsJson:{query},
        timezone
    })

    const toolCallId = toolCall.id;
    updateToolCallStatus(toolCallId, 'running');

    try {
        const searchResponse = await tinyfish.search.query({ query });
        if (!searchResponse || !Array.isArray(searchResponse.results)) {
            throw new Error('TinyFish returned an invalid search response');
        }

        for (const result of searchResponse.results) {
            insertSearchResult({
                toolCallId,
                conversationId,
                turnId,
                query,
                title:result.title,
                url:result.url,
                snippet:result.snippet,
                sourceDomain:result.site_name,
            })
        }

        const completedToolCall = completeToolCall(toolCallId, {
            resultSummary: `Stored ${searchResponse.results.length} search result(s)`,
        });
        if (!completedToolCall) {
            throw new Error(`Tool call not found after search: ${toolCallId}`);
        }

        return {
            toolCall: completedToolCall,
            results: searchResponse.results,
        };
    } catch (error) {
        const errorDetails = describeTinyFishError(error);
        const failedToolCall = completeToolCall(toolCallId, {
            status: 'failed',
            resultSummary: errorDetails.detail,
        });
        if (!failedToolCall) {
            logger.error('Failed to update search tool call after error', {
                toolCallId,
                error,
            });
        }
        logger.error(errorDetails.message, {
            toolCallId,
            conversationId,
            turnId,
            category: errorDetails.category,
            error,
        });
        throw error;
    }
}

export {searchWeb}