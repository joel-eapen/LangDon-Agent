import { randomUUID } from 'node:crypto';
import db from './index.js';
import { localDateForTimezone, nowUtc } from '../utils/clock.js';

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

export function listConversations(userId, { limit = 50, offset = 0 } = {}) {
  return db.prepare(`
    SELECT * FROM conversations
    WHERE user_id = ?
    ORDER BY COALESCE(last_message_at, created_at) DESC
    LIMIT ? OFFSET ?
  `).all(userId, Math.max(1, limit), Math.max(0, offset));
}

export function updateConversationTitle(id, title) {
  const result = db.prepare(`
    UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?
  `).run(title, nowUtc(), id);
  return result.changes ? findConversationById(id) : undefined;
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

export function listMessagesByLocalDate(userId, localDate) {
  return db.prepare(`
    SELECT * FROM messages
    WHERE user_id = ? AND local_date = ?
    ORDER BY ts_utc ASC, rowid ASC
  `).all(userId, localDate);
}

export function listMessagesByTurn(turnId) {
  return db.prepare(`
    SELECT * FROM messages WHERE turn_id = ?
    ORDER BY ts_utc ASC, rowid ASC
  `).all(turnId);
}

export function listRecentMessages(conversationId, { limit = 20, offset = 0 } = {}) {
  return db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY ts_utc DESC, rowid DESC
    LIMIT ? OFFSET ?
  `).all(conversationId, Math.max(1, limit), Math.max(0, offset));
}

export function searchMessages(query, { userId, conversationId, limit = 20 } = {}) {
  const conditions = ['messages_fts MATCH ?'];
  const parameters = [query];
  if (userId) {
    conditions.push('messages.user_id = ?');
    parameters.push(userId);
  }
  if (conversationId) {
    conditions.push('messages.conversation_id = ?');
    parameters.push(conversationId);
  }
  parameters.push(Math.max(1, limit));

  return db.prepare(`
    SELECT messages.*, bm25(messages_fts) AS rank
    FROM messages_fts
    JOIN messages ON messages.rowid = messages_fts.rowid
    WHERE ${conditions.join(' AND ')}
    ORDER BY rank
    LIMIT ?
  `).all(...parameters);
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
