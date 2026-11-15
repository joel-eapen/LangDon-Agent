import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyMigrations } from './migrations.js';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'langdon-db-'));
process.env.DB_PATH = path.join(temporaryDirectory, 'test.sqlite');

const { default: db } = await import('./index.js');
const repository = await import('./repositories.js');

test.after(() => {
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('migrates a legacy tool_calls table without changing existing records', () => {
  const legacyDb = new Database(':memory:');
  legacyDb.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, timezone TEXT NOT NULL);
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id)
    );
    CREATE TABLE tool_calls (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      tool_name TEXT NOT NULL,
      arguments_json TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL
    );
    INSERT INTO users VALUES ('user-1', 'UTC');
    INSERT INTO conversations VALUES ('conversation-1', 'user-1');
    INSERT INTO tool_calls VALUES (
      'tool-1', 'conversation-1', 'tinyfish_search', '{}', 'completed',
      '2026-11-15T00:00:00.000Z'
    );
  `);

  applyMigrations(legacyDb);
  assert.deepEqual(
    legacyDb.prepare('SELECT id, started_at FROM tool_calls').get(),
    { id: 'tool-1', started_at: '2026-11-15T00:00:00.000Z' },
  );
  assert.deepEqual(
    legacyDb.prepare('PRAGMA table_info(tool_calls)').all()
      .filter(({ name }) => ['local_date', 'timezone'].includes(name))
      .map(({ name }) => name),
    ['local_date', 'timezone'],
  );
  assert.equal(legacyDb.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fetch_results'
  `).get().name, 'fetch_results');
  legacyDb.close();
});

test('initializes all tables, indexes, and FTS triggers', () => {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type IN ('table', 'virtual table')
  `).all().map(({ name }) => name);

  for (const table of [
    'users',
    'conversations',
    'messages',
    'tool_calls',
    'search_results',
    'fetch_results',
    'daily_digests',
    'user_memories',
    'messages_fts',
  ]) {
    assert.ok(tables.includes(table));
  }
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  assert.ok(db.prepare(`
    SELECT 1 FROM schema_migrations
    WHERE id = '20261115_phase4_fetch_results'
  `).get());
});

test('persists users, conversations, and timezone-aware message dates', () => {
  const user = repository.createUser({ timezone: 'Asia/Kolkata' });
  const conversation = repository.createConversation({ userId: user.id });
  const message = repository.insertMessage({
    conversationId: conversation.id,
    userId: user.id,
    turnId: 'turn-1',
    role: 'user',
    content: 'Good morning',
    timezone: user.timezone,
    tsUtc: '2026-11-02T20:00:00.000Z',
  });

  assert.equal(message.local_date, '2026-11-03');
  assert.equal(repository.listMessagesByLocalDate(user.id, '2026-11-03').length, 1);
  assert.deepEqual(repository.listMessageDates(user.id), [{
    date: '2026-11-03',
    message_count: 1,
  }]);
  assert.equal(repository.findConversationById(conversation.id).last_message_at, message.ts_utc);

  const summary = repository.findConversationSummaryById(conversation.id);
  const updatedConversation = repository.findConversationById(conversation.id);
  assert.equal(summary.title, null);
  assert.equal(summary.created_at, conversation.created_at);
  assert.equal(summary.updated_at, updatedConversation.updated_at);
  assert.equal(summary.last_message_at, message.ts_utc);
  assert.equal(summary.message_count, 1);
});

test('verifies conversation ownership by user and conversation id', () => {
  const owner = repository.createUser();
  const otherUser = repository.createUser();
  const conversation = repository.createConversation({ userId: owner.id });
  const emptyConversation = repository.createConversation({ userId: owner.id, title: 'Empty' });

  assert.equal(repository.verifyConversationOwnership(owner.id, conversation.id), true);
  assert.equal(repository.verifyConversationOwnership(otherUser.id, conversation.id), false);
  assert.equal(repository.verifyConversationOwnership(owner.id, 'missing-conversation'), false);
  assert.equal(repository.findConversationSummaryById(emptyConversation.id).message_count, 0);
  assert.equal(repository.countConversations(owner.id), 2);
  assert.equal(repository.countConversations(otherUser.id), 0);
});

test('stores tool calls and search results', () => {
  const user = repository.createUser();
  const conversation = repository.createConversation({ userId: user.id });
  const message = repository.insertMessage({
    conversationId: conversation.id,
    userId: user.id,
    turnId: 'turn-2',
    role: 'assistant',
    content: 'Searching',
    timezone: 'UTC',
  });
  const toolCall = repository.createToolCall({
    conversationId: conversation.id,
    messageId: message.id,
    turnId: 'turn-2',
    toolName: 'search',
    argumentsJson: { query: 'SQLite' },
  });
  const completed = repository.completeToolCall(toolCall.id, {
    resultSummary: 'One result',
  });
  const result = repository.insertSearchResult({
    toolCallId: toolCall.id,
    conversationId: conversation.id,
    turnId: 'turn-2',
    query: 'SQLite',
    title: 'SQLite',
    url: 'https://sqlite.org',
  });

  assert.equal(completed.status, 'completed');
  assert.equal(repository.listToolCallsByTurn('turn-2').length, 1);
  assert.equal(repository.listSearchResultsByToolCall(toolCall.id)[0].id, result.id);
  assert.equal(repository.deleteConversation(conversation.id), true);
  assert.equal(repository.findConversationById(conversation.id), undefined);
  assert.equal(repository.findMessageById(message.id), undefined);
  assert.equal(repository.findToolCallById(toolCall.id), undefined);
  assert.equal(repository.findSearchResultById(result.id), undefined);
  assert.equal(repository.deleteConversation(conversation.id), false);
});

test('stores tool execution timezone dates and preserves them after timezone changes', () => {
  const user = repository.createUser({ timezone: 'Asia/Kolkata' });
  const conversation = repository.createConversation({ userId: user.id });
  const toolCall = repository.createToolCall({
    conversationId: conversation.id,
    turnId: 'timezone-turn',
    toolName: 'tinyfish_fetch',
    argumentsJson: { url: 'https://example.com' },
    startedAt: '2026-11-02T18:45:00.000Z',
  });

  assert.equal(toolCall.started_at, '2026-11-02T18:45:00.000Z');
  assert.equal(toolCall.local_date, '2026-11-03');
  assert.equal(toolCall.timezone, 'Asia/Kolkata');

  repository.updateUserTimezone(user.id, 'America/Los_Angeles');
  const stored = repository.findToolCallById(toolCall.id);
  assert.equal(stored.local_date, '2026-11-03');
  assert.equal(stored.timezone, 'Asia/Kolkata');
});

test('stores and retrieves multiple fetch snapshots for one tool call', () => {
  const user = repository.createUser();
  const conversation = repository.createConversation({ userId: user.id });
  const toolCall = repository.createToolCall({
    conversationId: conversation.id,
    turnId: 'fetch-turn',
    toolName: 'tinyfish_fetch',
    argumentsJson: { urls: ['https://example.com'] },
  });

  const first = repository.insertFetchResult({
    toolCallId: toolCall.id,
    conversationId: conversation.id,
    turnId: toolCall.turn_id,
    url: 'https://example.com',
    content: '# First snapshot',
    contentHash: 'hash-1',
    status: 'completed',
  });
  const second = repository.insertFetchResult({
    toolCallId: toolCall.id,
    conversationId: conversation.id,
    turnId: toolCall.turn_id,
    url: 'https://example.com',
    content: '# Second snapshot',
    contentHash: 'hash-2',
    status: 'completed',
  });

  assert.deepEqual(
    repository.listFetchResultsByToolCall(toolCall.id).map(({ id }) => id),
    [first.id, second.id],
  );
  assert.deepEqual(repository.listFetchResultsByToolCalls([]), []);
});

test('includes fetch results in turn history and cascades tool deletion', () => {
  const user = repository.createUser();
  const conversation = repository.createConversation({ userId: user.id });
  const toolCall = repository.createToolCall({
    conversationId: conversation.id,
    turnId: 'fetch-history-turn',
    toolName: 'tinyfish_fetch',
    argumentsJson: { url: 'https://example.com' },
  });
  const fetchResult = repository.insertFetchResult({
    toolCallId: toolCall.id,
    conversationId: conversation.id,
    turnId: toolCall.turn_id,
    url: 'https://example.com',
    status: 'failed',
    errorMessage: 'timeout',
  });

  const history = repository.getTurnHistory(user.id, 'fetch-history-turn');
  assert.equal(history.fetchResults[0].id, fetchResult.id);

  db.prepare('DELETE FROM tool_calls WHERE id = ?').run(toolCall.id);
  assert.equal(repository.findFetchResultById(fetchResult.id), undefined);
});

test('retrieves user-scoped turn history with messages, tools, and results', () => {
  const user = repository.createUser();
  const otherUser = repository.createUser();
  const conversation = repository.createConversation({ userId: user.id });
  const otherConversation = repository.createConversation({ userId: otherUser.id });
  const message = repository.insertMessage({
    conversationId: conversation.id,
    userId: user.id,
    turnId: 'shared-turn',
    role: 'assistant',
    content: 'I searched for that.',
    timezone: 'UTC',
    tsUtc: '2026-11-03T10:00:00.000Z',
  });
  const toolCall = repository.createToolCall({
    conversationId: conversation.id,
    messageId: message.id,
    turnId: 'shared-turn',
    toolName: 'web_search',
    argumentsJson: { query: 'SQLite' },
    startedAt: '2026-11-03T10:00:01.000Z',
  });
  repository.insertSearchResult({
    toolCallId: toolCall.id,
    conversationId: conversation.id,
    turnId: 'shared-turn',
    query: 'SQLite',
    title: 'SQLite',
    url: 'https://sqlite.org',
    retrievedAt: '2026-11-03T10:00:02.000Z',
  });
  repository.insertMessage({
    conversationId: otherConversation.id,
    userId: otherUser.id,
    turnId: 'shared-turn',
    role: 'user',
    content: 'Private message',
    timezone: 'UTC',
  });

  const history = repository.getTurnHistory(user.id, 'shared-turn');
  assert.equal(history.messages.length, 1);
  assert.equal(history.toolCalls.length, 1);
  assert.equal(history.searchResults.length, 1);
  assert.equal(history.messages[0].id, message.id);
  assert.equal(history.toolCalls[0].id, toolCall.id);
});

test('lists paginated TinyFish searches and batches their results', () => {
  const user = repository.createUser();
  const otherUser = repository.createUser();
  const conversation = repository.createConversation({ userId: user.id });
  const otherConversation = repository.createConversation({ userId: otherUser.id });

  const firstSearch = repository.createToolCall({
    conversationId: conversation.id,
    turnId: 'search-history-1',
    toolName: 'tinyfish_search',
    argumentsJson: { query: 'Redis hosting providers' },
    status: 'failed',
    startedAt: '2026-11-03T10:00:00.000Z',
  });
  const secondSearch = repository.createToolCall({
    conversationId: conversation.id,
    turnId: 'search-history-2',
    toolName: 'tinyfish_search',
    argumentsJson: { query: 'SQLite documentation' },
    status: 'incomplete',
    startedAt: '2026-11-03T09:00:00.000Z',
  });
  repository.createToolCall({
    conversationId: conversation.id,
    turnId: 'unrelated-tool',
    toolName: 'email',
    argumentsJson: { to: 'user@example.com' },
    startedAt: '2026-11-03T11:00:00.000Z',
  });
  repository.createToolCall({
    conversationId: otherConversation.id,
    turnId: 'other-user-search',
    toolName: 'tinyfish_search',
    argumentsJson: { query: 'private query' },
    startedAt: '2026-11-03T12:00:00.000Z',
  });

  repository.insertSearchResult({
    toolCallId: firstSearch.id,
    conversationId: conversation.id,
    turnId: firstSearch.turn_id,
    query: 'Redis hosting providers',
    title: 'Redis',
    url: 'https://redis.io',
    retrievedAt: '2026-11-03T10:00:01.000Z',
  });
  repository.insertSearchResult({
    toolCallId: firstSearch.id,
    conversationId: conversation.id,
    turnId: firstSearch.turn_id,
    query: 'Redis hosting providers',
    title: 'Redis Cloud',
    url: 'https://redis.io/cloud',
    retrievedAt: '2026-11-03T10:00:02.000Z',
  });

  const page = repository.listConversationSearches({
    userId: user.id,
    conversationId: conversation.id,
    toolName: 'tinyfish_search',
    page: 1,
    limit: 1,
  });
  assert.equal(page.totalSearches, 2);
  assert.equal(page.toolCalls.length, 1);
  assert.equal(page.toolCalls[0].id, firstSearch.id);
  assert.equal(page.searchResults.length, 2);
  assert.equal(page.searchResults[0].tool_call_id, firstSearch.id);
  assert.equal(page.searchResults[1].tool_call_id, firstSearch.id);

  const secondPage = repository.listConversationSearches({
    userId: user.id,
    conversationId: conversation.id,
    toolName: 'tinyfish_search',
    page: 2,
    limit: 1,
  });
  assert.equal(secondPage.toolCalls[0].id, secondSearch.id);
  assert.equal(secondPage.searchResults.length, 0);
});

test('filters historical searches by tool execution local date', () => {
  const user = repository.createUser({ timezone: 'Asia/Kolkata' });
  const conversation = repository.createConversation({ userId: user.id });
  const toolCall = repository.createToolCall({
    conversationId: conversation.id,
    turnId: 'dated-search-turn',
    toolName: 'tinyfish_search',
    argumentsJson: { query: 'Redis' },
    status: 'failed',
    startedAt: '2026-11-02T18:45:00.000Z',
  });

  const history = repository.listHistoricalSearches({
    userId: user.id,
    localDate: '2026-11-03',
    toolName: 'tinyfish_search',
  });
  assert.equal(history.totalSearches, 1);
  assert.equal(history.toolCalls[0].id, toolCall.id);
  assert.equal(repository.listHistoricalSearches({
    userId: user.id,
    localDate: '2026-11-02',
    toolName: 'tinyfish_search',
  }).totalSearches, 0);
});

test('keeps FTS synchronized when messages are inserted and deleted', () => {
  const user = repository.createUser();
  const conversation = repository.createConversation({ userId: user.id });
  const message = repository.insertMessage({
    conversationId: conversation.id,
    userId: user.id,
    turnId: 'turn-3',
    role: 'user',
    content: 'unique searchable phrase',
    timezone: 'UTC',
  });

  assert.equal(repository.searchMessages({
    userId: user.id,
    query: 'unique searchable phrase',
  }).results.length, 1);
  db.prepare('UPDATE messages SET content = ? WHERE id = ?')
    .run('updated searchable phrase', message.id);
  assert.equal(repository.searchMessages({
    userId: user.id,
    query: 'updated searchable phrase',
  }).results.length, 1);
  assert.equal(repository.searchMessages({
    userId: user.id,
    query: 'unique searchable phrase',
  }).results.length, 0);
  db.prepare('DELETE FROM messages WHERE id = ?').run(message.id);
  assert.equal(repository.searchMessages({
    userId: user.id,
    query: 'updated searchable phrase',
  }).results.length, 0);
});

test('searches messages with filters, ranking, pagination, and user isolation', () => {
  const user = repository.createUser();
  const otherUser = repository.createUser();
  const firstConversation = repository.createConversation({
    userId: user.id,
    title: 'Redis',
  });
  const secondConversation = repository.createConversation({
    userId: user.id,
    title: 'Databases',
  });
  const otherConversation = repository.createConversation({ userId: otherUser.id });

  repository.insertMessage({
    conversationId: firstConversation.id,
    userId: user.id,
    turnId: 'search-turn-1',
    role: 'user',
    content: 'Redis caching improves response time',
    timezone: 'UTC',
    tsUtc: '2026-11-03T10:00:00.000Z',
  });
  repository.insertMessage({
    conversationId: firstConversation.id,
    userId: user.id,
    turnId: 'search-turn-2',
    role: 'assistant',
    content: 'Redis caching can reduce database load',
    timezone: 'UTC',
    tsUtc: '2026-11-04T10:00:00.000Z',
  });
  repository.insertMessage({
    conversationId: secondConversation.id,
    userId: user.id,
    turnId: 'search-turn-3',
    role: 'assistant',
    content: 'Database caching is useful',
    timezone: 'UTC',
    tsUtc: '2026-11-05T10:00:00.000Z',
  });
  repository.insertMessage({
    conversationId: otherConversation.id,
    userId: otherUser.id,
    turnId: 'search-turn-4',
    role: 'user',
    content: 'Redis caching belongs to another user',
    timezone: 'UTC',
  });

  const allResults = repository.searchMessages({
    userId: user.id,
    query: 'Redis caching',
    limit: 1,
  });
  assert.equal(allResults.totalResults, 2);
  assert.equal(allResults.results.length, 1);
  assert.match(allResults.results[0].matched_text, /<mark>/);
  assert.ok(allResults.results[0].relevance <= 0);

  const assistantResults = repository.searchMessages({
    userId: user.id,
    query: 'caching',
    role: 'assistant',
  });
  assert.equal(assistantResults.totalResults, 2);

  const dateResults = repository.searchMessages({
    userId: user.id,
    query: 'caching',
    from: '2026-11-04',
    to: '2026-11-04',
  });
  assert.equal(dateResults.totalResults, 1);

  const conversationResults = repository.searchMessages({
    userId: user.id,
    query: 'caching',
    conversationId: secondConversation.id,
  });
  assert.equal(conversationResults.totalResults, 1);

  const pageTwo = repository.searchMessages({
    userId: user.id,
    query: 'caching',
    page: 2,
    limit: 1,
  });
  assert.equal(pageTwo.totalResults, 3);
  assert.equal(pageTwo.results.length, 1);

  assert.equal(repository.searchMessages({
    userId: user.id,
    query: 'Redis AND caching',
  }).totalResults, 0);
  assert.equal(repository.searchMessages({
    userId: user.id,
    query: '++',
  }).totalResults, 0);
  assert.equal(repository.searchMessages({
    userId: user.id,
    query: 'Redis caching',
    conversationId: otherConversation.id,
  }).totalResults, 0);
});

test('upserts digests and supports explicit memory deletion', () => {
  const user = repository.createUser();
  const first = repository.upsertDigest({
    userId: user.id,
    localDate: '2026-11-03',
    summary: 'First summary',
    messageCount: 1,
  });
  const second = repository.upsertDigest({
    userId: user.id,
    localDate: '2026-11-03',
    summary: 'Updated summary',
    messageCount: 2,
  });
  const memory = repository.insertMemory({ userId: user.id, memory: 'Prefers concise answers' });

  assert.equal(first.id, second.id);
  assert.equal(repository.findDigestByUserAndDate(user.id, '2026-11-03').message_count, 2);
  assert.equal(repository.deleteMemory(memory.id), true);
  assert.equal(repository.findMemoryById(memory.id), undefined);
});

test('rolls back a message transaction when the conversation update fails', () => {
  const user = repository.createUser();
  const conversation = repository.createConversation({ userId: user.id });
  db.exec(`
    CREATE TRIGGER fail_conversation_update
    BEFORE UPDATE OF last_message_at ON conversations
    WHEN NEW.id = '${conversation.id}'
    BEGIN
      SELECT RAISE(ABORT, 'forced transaction failure');
    END;
  `);

  assert.throws(() => repository.insertMessage({
    conversationId: conversation.id,
    userId: user.id,
    turnId: 'turn-rollback',
    role: 'user',
    content: 'Should roll back',
    timezone: 'UTC',
  }), /forced transaction failure/);
  db.exec('DROP TRIGGER fail_conversation_update');
  assert.equal(repository.listMessagesByTurn('turn-rollback').length, 0);
});
