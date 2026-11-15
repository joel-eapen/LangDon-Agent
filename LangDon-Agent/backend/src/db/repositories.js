import { randomUUID } from 'node:crypto';
import db from './index.js';
import { localDateForTimezone, nowUtc } from '../utils/clock.js';
import { normalizeSearchQuery } from '../utils/search-query.js';

const createId = () => randomUUID();

export function createUser({ externalId = null, timezone = 'UTC', id = createId() } = {}) {
  const timestamp = nowUtc();
  localDateForTimezone(timestamp, timezone);
  db.prepare(`
    INSERT INTO users (id, external_id, timezone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, externalId, timezone, timestamp, timestamp);
  return findUserById(id);
}

export function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function findUserByExternalId(externalId) {
  return db.prepare('SELECT * FROM users WHERE external_id = ?').get(externalId);
}

export function updateUserTimezone(id, timezone) {
  localDateForTimezone(nowUtc(), timezone);
  const result = db.prepare(`
    UPDATE users SET timezone = ?, updated_at = ? WHERE id = ?
  `).run(timezone, nowUtc(), id);
  return result.changes ? findUserById(id) : undefined;
}

export function createConversation({ userId, title = null, id = createId() }) {
  const timestamp = nowUtc();
  db.prepare(`
    INSERT INTO conversations (id, user_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, title, timestamp, timestamp);
  return findConversationById(id);
}

export function findConversationById(id) {
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

export function findConversationSummaryById(id) {
  return db.prepare(`
    SELECT
      conversations.title,
      conversations.created_at,
      conversations.updated_at,
      conversations.last_message_at,
      COUNT(messages.id) AS message_count
    FROM conversations
    LEFT JOIN messages ON messages.conversation_id = conversations.id
    WHERE conversations.id = ?
    GROUP BY conversations.id
  `).get(id);
}

export function verifyConversationOwnership(userId, conversationId) {
  return Boolean(db.prepare(`
    SELECT 1
    FROM conversations
    WHERE id = ? AND user_id = ?
  `).get(conversationId, userId));
}

export function listConversationSearches({
  userId,
  conversationId,
  toolName,
  page = 1,
  limit = 10,
}) {
  const pageNumber = Math.max(1, page);
  const limitNumber = Math.min(50, Math.max(1, limit));
  const offset = (pageNumber - 1) * limitNumber;

  return db.transaction(() => {
    const totalSearches = db.prepare(`
      SELECT COUNT(*) AS count
      FROM tool_calls
      JOIN conversations ON conversations.id = tool_calls.conversation_id
      WHERE conversations.id = ?
        AND conversations.user_id = ?
        AND tool_calls.tool_name = ?
    `).get(conversationId, userId, toolName).count;

    const toolCalls = db.prepare(`
      SELECT tool_calls.*
      FROM tool_calls
      JOIN conversations ON conversations.id = tool_calls.conversation_id
      WHERE conversations.id = ?
        AND conversations.user_id = ?
        AND tool_calls.tool_name = ?
      ORDER BY tool_calls.started_at DESC, tool_calls.rowid DESC
      LIMIT ? OFFSET ?
    `).all(conversationId, userId, toolName, limitNumber, offset);

    if (toolCalls.length === 0) {
      return { totalSearches, toolCalls, searchResults: [] };
    }

    const toolCallIds = toolCalls.map(({ id }) => id);
    const placeholders = toolCallIds.map(() => '?').join(', ');
    const searchResults = db.prepare(`
      SELECT search_results.*
      FROM search_results
      JOIN tool_calls ON tool_calls.id = search_results.tool_call_id
      JOIN conversations ON conversations.id = search_results.conversation_id
      WHERE conversations.id = ?
        AND conversations.user_id = ?
        AND tool_calls.tool_name = ?
        AND tool_calls.id IN (${placeholders})
        AND tool_calls.conversation_id = search_results.conversation_id
      ORDER BY search_results.retrieved_at ASC, search_results.rowid ASC
    `).all(conversationId, userId, toolName, ...toolCallIds);

    return { totalSearches, toolCalls, searchResults };
  })();
}

export function listConversations(userId, { limit = 50, offset = 0 } = {}) {
  return db.prepare(`
    SELECT * FROM conversations
    WHERE user_id = ?
    ORDER BY COALESCE(last_message_at, created_at) DESC
    LIMIT ? OFFSET ?
  `).all(userId, Math.max(1, limit), Math.max(0, offset));
}

export function countConversations(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS count
    FROM conversations
    WHERE user_id = ?
  `).get(userId).count;
}

export function updateConversationTitle(id, title) {
  const result = db.prepare(`
    UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?
  `).run(title, nowUtc(), id);
  return result.changes ? findConversationById(id) : undefined;
}

export function deleteConversation(id) {
  return db.transaction(() => {
    db.prepare('DELETE FROM search_results WHERE conversation_id = ?').run(id);
    db.prepare('DELETE FROM tool_calls WHERE conversation_id = ?').run(id);
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
    return db.prepare('DELETE FROM conversations WHERE id = ?').run(id).changes > 0;
  })();
}

export function updateLastMessageAt(id, timestamp = nowUtc()) {
  const result = db.prepare(`
    UPDATE conversations
    SET last_message_at = ?, updated_at = ?
    WHERE id = ?
  `).run(timestamp, nowUtc(), id);
  return result.changes > 0;
}

export function insertMessage({
  conversationId,
  userId,
  turnId,
  role,
  content,
  gist = null,
  timezone,
  tsUtc = nowUtc(),
  id = createId(),
}) {
  const insert = db.prepare(`
    INSERT INTO messages (
      id, conversation_id, user_id, turn_id, role, content, gist,
      ts_utc, timezone, local_date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateConversation = db.prepare(`
    UPDATE conversations
    SET last_message_at = ?, updated_at = ?
    WHERE id = ?
  `);
  const conversation = db.prepare(
    'SELECT user_id FROM conversations WHERE id = ?',
  ).get(conversationId);

  if (!conversation) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }
  if (conversation.user_id !== userId) {
    throw new Error('Message user does not own the conversation');
  }

  const localDate = localDateForTimezone(tsUtc, timezone);
  db.transaction(() => {
    insert.run(
      id,
      conversationId,
      userId,
      turnId,
      role,
      content,
      gist,
      new Date(tsUtc).toISOString(),
      timezone,
      localDate,
      nowUtc(),
    );
    updateConversation.run(tsUtc, nowUtc(), conversationId);
  })();

  return findMessageById(id);
}

export function findMessageById(id) {
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

export function listMessagesByConversation(conversationId, { limit = 100, offset = 0 } = {}) {
  return db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY ts_utc ASC, rowid ASC
    LIMIT ? OFFSET ?
  `).all(conversationId, Math.max(1, limit), Math.max(0, offset));
}

export function countMessagesByConversation(conversationId) {
  return db.prepare(`
    SELECT COUNT(*) AS count
    FROM messages
    WHERE conversation_id = ?
  `).get(conversationId).count;
}

export function listMessagesByLocalDate(userId, localDate) {
  return db.prepare(`
    SELECT * FROM messages
    WHERE user_id = ? AND local_date = ?
    ORDER BY ts_utc ASC, rowid ASC
  `).all(userId, localDate);
}

export function listMessageDates(userId) {
  return db.prepare(`
    SELECT local_date AS date, COUNT(*) AS message_count
    FROM messages
    WHERE user_id = ?
    GROUP BY local_date
    ORDER BY local_date DESC
  `).all(userId);
}

export function listHistoricalSearches({
  userId,
  localDate,
  toolName,
  page = 1,
  limit = 10,
}) {
  const pageNumber = Math.max(1, page);
  const limitNumber = Math.min(50, Math.max(1, limit));
  const offset = (pageNumber - 1) * limitNumber;

  return db.transaction(() => {
    const dateFilter = `
      (
        origin.local_date = ?
        OR (
          origin.id IS NULL
          AND EXISTS (
            SELECT 1
            FROM messages turn_message
            WHERE turn_message.conversation_id = tool_calls.conversation_id
              AND turn_message.turn_id = tool_calls.turn_id
              AND turn_message.user_id = ?
              AND turn_message.local_date = ?
          )
        )
      )
    `;
    const filterParameters = [userId, toolName, localDate, userId, localDate];
    const totalSearches = db.prepare(`
      SELECT COUNT(*) AS count
      FROM tool_calls
      JOIN conversations
        ON conversations.id = tool_calls.conversation_id
      LEFT JOIN messages origin
        ON origin.id = tool_calls.message_id
       AND origin.conversation_id = tool_calls.conversation_id
      WHERE conversations.user_id = ?
        AND tool_calls.tool_name = ?
        AND ${dateFilter}
    `).get(...filterParameters).count;

    const toolCalls = db.prepare(`
      SELECT
        tool_calls.*,
        conversations.title AS conversation_title
      FROM tool_calls
      JOIN conversations
        ON conversations.id = tool_calls.conversation_id
      LEFT JOIN messages origin
        ON origin.id = tool_calls.message_id
       AND origin.conversation_id = tool_calls.conversation_id
      WHERE conversations.user_id = ?
        AND tool_calls.tool_name = ?
        AND ${dateFilter}
      ORDER BY tool_calls.started_at ASC, tool_calls.rowid ASC
      LIMIT ? OFFSET ?
    `).all(...filterParameters, limitNumber, offset);

    if (toolCalls.length === 0) {
      return { totalSearches, toolCalls, searchResults: [] };
    }

    const toolCallIds = toolCalls.map(({ id }) => id);
    const placeholders = toolCallIds.map(() => '?').join(', ');
    const searchResults = db.prepare(`
      SELECT search_results.*
      FROM search_results
      JOIN tool_calls
        ON tool_calls.id = search_results.tool_call_id
      JOIN conversations
        ON conversations.id = search_results.conversation_id
      WHERE conversations.user_id = ?
        AND tool_calls.tool_name = ?
        AND tool_calls.conversation_id = search_results.conversation_id
        AND search_results.tool_call_id IN (${placeholders})
      ORDER BY search_results.retrieved_at ASC, search_results.rowid ASC
    `).all(userId, toolName, ...toolCallIds);

    return { totalSearches, toolCalls, searchResults };
  })();
}

export function listMessagesByTurn(turnId) {
  return db.prepare(`
    SELECT * FROM messages WHERE turn_id = ?
    ORDER BY ts_utc ASC, rowid ASC
  `).all(turnId);
}

export function getTurnHistory(userId, turnId) {
  const messages = db.prepare(`
    SELECT messages.*
    FROM messages
    JOIN conversations ON conversations.id = messages.conversation_id
    WHERE conversations.user_id = ? AND messages.turn_id = ?
    ORDER BY messages.ts_utc ASC, messages.rowid ASC
  `).all(userId, turnId);

  const toolCalls = db.prepare(`
    SELECT tool_calls.*
    FROM tool_calls
    JOIN conversations ON conversations.id = tool_calls.conversation_id
    WHERE conversations.user_id = ? AND tool_calls.turn_id = ?
    ORDER BY tool_calls.started_at ASC, tool_calls.rowid ASC
  `).all(userId, turnId);

  const searchResults = db.prepare(`
    SELECT search_results.*
    FROM search_results
    JOIN tool_calls ON tool_calls.id = search_results.tool_call_id
    JOIN conversations ON conversations.id = search_results.conversation_id
    WHERE conversations.user_id = ?
      AND tool_calls.turn_id = ?
      AND tool_calls.conversation_id = search_results.conversation_id
    ORDER BY search_results.retrieved_at ASC, search_results.rowid ASC
  `).all(userId, turnId);

  return { messages, toolCalls, searchResults };
}

export function listRecentMessages(conversationId, { limit = 20, offset = 0 } = {}) {
  return db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY ts_utc DESC, rowid DESC
    LIMIT ? OFFSET ?
  `).all(conversationId, Math.max(1, limit), Math.max(0, offset));
}

export function searchMessages({
  userId,
  query,
  page = 1,
  limit = 10,
  role,
  from,
  to,
  conversationId,
}) {
  const normalized = normalizeSearchQuery(query);
  if (!normalized.ftsQuery) {
    return { totalResults: 0, results: [] };
  }

  const conditions = [
    'messages_fts MATCH ?',
    'messages.user_id = ?',
  ];
  const filterParameters = [normalized.ftsQuery, userId];

  if (role) {
    conditions.push('messages.role = ?');
    filterParameters.push(role);
  }
  if (from) {
    conditions.push('messages.local_date >= ?');
    filterParameters.push(from);
  }
  if (to) {
    conditions.push('messages.local_date <= ?');
    filterParameters.push(to);
  }
  if (conversationId) {
    conditions.push('messages.conversation_id = ?');
    filterParameters.push(conversationId);
  }

  const whereClause = conditions.join(' AND ');
  const totalResults = db.prepare(`
    SELECT COUNT(*) AS totalResults
    FROM messages_fts
    JOIN messages ON messages.rowid = messages_fts.rowid
    WHERE ${whereClause}
  `).get(...filterParameters).totalResults;

  const pageNumber = Math.max(1, page);
  const limitNumber = Math.min(50, Math.max(1, limit));
  const offset = (pageNumber - 1) * limitNumber;
  const results = db.prepare(`
    SELECT
      messages.id AS message_id,
      messages.role,
      messages.content,
      messages.turn_id,
      messages.ts_utc,
      messages.local_date,
      conversations.id AS conversation_id,
      conversations.title AS conversation_title,
      snippet(messages_fts, 0, '<mark>', '</mark>', '...', 12) AS matched_text,
      bm25(messages_fts) AS relevance
    FROM messages_fts
    JOIN messages ON messages.rowid = messages_fts.rowid
    JOIN conversations ON conversations.id = messages.conversation_id
    WHERE ${whereClause}
    ORDER BY relevance ASC, messages.ts_utc DESC, messages.rowid DESC
    LIMIT ? OFFSET ?
  `).all(...filterParameters, limitNumber, offset);

  return { totalResults, results };
}

export function createToolCall({
  conversationId,
  messageId = null,
  turnId,
  toolName,
  argumentsJson,
  status = 'pending',
  startedAt = nowUtc(),
  id = createId(),
}) {
  const serializedArguments = typeof argumentsJson === 'string'
    ? argumentsJson
    : JSON.stringify(argumentsJson);
  db.prepare(`
    INSERT INTO tool_calls (
      id, conversation_id, message_id, turn_id, tool_name,
      arguments_json, status, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, conversationId, messageId, turnId, toolName, serializedArguments, status, startedAt);
  return findToolCallById(id);
}

export function findToolCallById(id) {
  return db.prepare('SELECT * FROM tool_calls WHERE id = ?').get(id);
}

export function updateToolCallStatus(id, status) {
  const result = db.prepare(`
    UPDATE tool_calls SET status = ? WHERE id = ?
  `).run(status, id);
  return result.changes ? findToolCallById(id) : undefined;
}

export function completeToolCall(id, { status = 'completed', resultSummary = null, completedAt = nowUtc() } = {}) {
  const toolCall = findToolCallById(id);
  if (!toolCall) {
    return undefined;
  }
  const durationMs = Math.max(
    0,
    new Date(completedAt).getTime() - new Date(toolCall.started_at).getTime(),
  );
  db.prepare(`
    UPDATE tool_calls
    SET status = ?, result_summary = ?, completed_at = ?, duration_ms = ?
    WHERE id = ?
  `).run(status, resultSummary, completedAt, durationMs, id);
  return findToolCallById(id);
}

export function listToolCallsByTurn(turnId) {
  return db.prepare('SELECT * FROM tool_calls WHERE turn_id = ? ORDER BY started_at').all(turnId);
}

export function listToolCallsByConversation(conversationId) {
  return db.prepare(`
    SELECT * FROM tool_calls WHERE conversation_id = ? ORDER BY started_at
  `).all(conversationId);
}

export function insertSearchResult({
  toolCallId,
  conversationId,
  turnId,
  query,
  title,
  url,
  snippet = null,
  sourceDomain = null,
  publishedAt = null,
  retrievedAt = nowUtc(),
  id = createId(),
}) {
  db.prepare(`
    INSERT INTO search_results (
      id, tool_call_id, conversation_id, turn_id, query, title, url,
      snippet, source_domain, published_at, retrieved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    toolCallId,
    conversationId,
    turnId,
    query,
    title,
    url,
    snippet,
    sourceDomain,
    publishedAt,
    retrievedAt,
  );
  return findSearchResultById(id);
}

export function findSearchResultById(id) {
  return db.prepare('SELECT * FROM search_results WHERE id = ?').get(id);
}

export function listSearchResultsByToolCall(toolCallId) {
  return db.prepare(`
    SELECT * FROM search_results WHERE tool_call_id = ? ORDER BY retrieved_at
  `).all(toolCallId);
}

export function listSearchResultsByConversationTurn(conversationId, turnId) {
  return db.prepare(`
    SELECT * FROM search_results
    WHERE conversation_id = ? AND turn_id = ?
    ORDER BY retrieved_at
  `).all(conversationId, turnId);
}

export function upsertDigest({ userId, localDate, summary, messageCount, id = createId() }) {
  const timestamp = nowUtc();
  db.prepare(`
    INSERT INTO daily_digests (
      id, user_id, local_date, summary, message_count, generated_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, local_date) DO UPDATE SET
      summary = excluded.summary,
      message_count = excluded.message_count,
      updated_at = excluded.updated_at
  `).run(id, userId, localDate, summary, messageCount, timestamp, timestamp);
  return findDigestByUserAndDate(userId, localDate);
}

export function findDigestByUserAndDate(userId, localDate) {
  return db.prepare(`
    SELECT * FROM daily_digests WHERE user_id = ? AND local_date = ?
  `).get(userId, localDate);
}

export function listDigestsByDateRange(userId, fromDate, toDate) {
  return db.prepare(`
    SELECT * FROM daily_digests
    WHERE user_id = ? AND local_date BETWEEN ? AND ?
    ORDER BY local_date
  `).all(userId, fromDate, toDate);
}

export function insertMemory({
  userId,
  memory,
  category = null,
  sourceMessageId = null,
  id = createId(),
}) {
  const timestamp = nowUtc();
  db.prepare(`
    INSERT INTO user_memories (
      id, user_id, memory, category, source_message_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, memory, category, sourceMessageId, timestamp, timestamp);
  return findMemoryById(id);
}

export function findMemoryById(id) {
  return db.prepare('SELECT * FROM user_memories WHERE id = ?').get(id);
}

export function listMemories(userId) {
  return db.prepare(`
    SELECT * FROM user_memories WHERE user_id = ? ORDER BY created_at
  `).all(userId);
}

export function updateMemory(id, { memory, category }) {
  const result = db.prepare(`
    UPDATE user_memories
    SET memory = COALESCE(?, memory), category = COALESCE(?, category), updated_at = ?
    WHERE id = ?
  `).run(memory, category, nowUtc(), id);
  return result.changes ? findMemoryById(id) : undefined;
}

export function deleteMemory(id) {
  return db.prepare('DELETE FROM user_memories WHERE id = ?').run(id).changes > 0;
}
