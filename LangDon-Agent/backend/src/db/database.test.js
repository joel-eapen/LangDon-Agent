import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'langdon-db-'));
process.env.DB_PATH = path.join(temporaryDirectory, 'test.sqlite');

const { default: db } = await import('./index.js');
const repository = await import('./repositories.js');

test.after(() => {
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
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
    'daily_digests',
    'user_memories',
    'messages_fts',
  ]) {
    assert.ok(tables.includes(table));
  }
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
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

  assert.equal(repository.searchMessages('"unique searchable phrase"', { userId: user.id }).length, 1);
  db.prepare('DELETE FROM messages WHERE id = ?').run(message.id);
  assert.equal(repository.searchMessages('"unique searchable phrase"', { userId: user.id }).length, 0);
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
