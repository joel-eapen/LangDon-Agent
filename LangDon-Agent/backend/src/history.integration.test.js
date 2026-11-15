import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'langdon-history-'));
process.env.DB_PATH = path.join(temporaryDirectory, 'history.sqlite');
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-only-used-by-tests';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_ISSUER = 'minimi-agent';
process.env.JWT_AUDIENCE = 'minimi-client';
process.env.REFRESH_TOKEN_EXPIRES_DAYS = '30';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';

const { default: app } = await import('./app.js');
const { default: db } = await import('./db/index.js');
const repository = await import('./db/repositories.js');
const { signAccessToken } = await import('./utils/jwt.js');

const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const requestJson = async (pathName, token) => {
  const response = await fetch(`${baseUrl}${pathName}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return { response, body: await response.json() };
};

const owner = repository.createUser({ timezone: 'Asia/Kolkata' });
const otherUser = repository.createUser({ timezone: 'UTC' });
const ownerConversation = repository.createConversation({
  userId: owner.id,
  title: 'Redis research',
});
const otherConversation = repository.createConversation({
  userId: otherUser.id,
  title: 'Private conversation',
});
const ownerToken = signAccessToken(owner.id);
const otherToken = signAccessToken(otherUser.id);

const ownerMessage = repository.insertMessage({
  conversationId: ownerConversation.id,
  userId: owner.id,
  turnId: 'owner-turn',
  role: 'user',
  content: 'Find Redis hosting providers',
  timezone: owner.timezone,
  tsUtc: '2026-11-02T20:00:00.000Z',
});
const ownerAssistantMessage = repository.insertMessage({
  conversationId: ownerConversation.id,
  userId: owner.id,
  turnId: 'owner-turn',
  role: 'assistant',
  content: 'I will search for Redis hosting providers.',
  timezone: owner.timezone,
  tsUtc: '2026-11-02T20:01:00.000Z',
});
const ownerSearch = repository.createToolCall({
  conversationId: ownerConversation.id,
  messageId: ownerAssistantMessage.id,
  turnId: 'owner-turn',
  toolName: 'tinyfish_search',
  argumentsJson: { query: 'Redis hosting providers' },
  status: 'completed',
  startedAt: '2026-11-02T20:02:00.000Z',
});
repository.completeToolCall(ownerSearch.id, {
  completedAt: '2026-11-02T20:02:05.000Z',
});
repository.insertSearchResult({
  toolCallId: ownerSearch.id,
  conversationId: ownerConversation.id,
  turnId: 'owner-turn',
  query: 'Redis hosting providers',
  title: 'Redis',
  url: 'https://redis.io',
  snippet: 'Redis documentation',
  retrievedAt: '2026-11-02T20:02:05.000Z',
});
repository.insertSearchResult({
  toolCallId: ownerSearch.id,
  conversationId: ownerConversation.id,
  turnId: 'owner-turn',
  query: 'Redis hosting providers',
  title: 'Redis Cloud',
  url: 'https://redis.io/cloud',
  retrievedAt: '2026-11-02T20:02:06.000Z',
});

const zeroResultMessage = repository.insertMessage({
  conversationId: ownerConversation.id,
  userId: owner.id,
  turnId: 'zero-result-turn',
  role: 'user',
  content: 'Search for an unavailable result',
  timezone: owner.timezone,
  tsUtc: '2026-11-02T20:03:00.000Z',
});
const zeroResultSearch = repository.createToolCall({
  conversationId: ownerConversation.id,
  messageId: zeroResultMessage.id,
  turnId: zeroResultMessage.turn_id,
  toolName: 'tinyfish_search',
  argumentsJson: { query: 'unavailable result' },
  status: 'failed',
  startedAt: '2026-11-02T20:04:00.000Z',
});

repository.insertMessage({
  conversationId: otherConversation.id,
  userId: otherUser.id,
  turnId: 'other-turn',
  role: 'user',
  content: 'Private Redis search',
  timezone: otherUser.timezone,
  tsUtc: '2026-11-04T10:00:00.000Z',
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('retrieves turn messages, tool calls, and search results across a local-date boundary', async () => {
  const turn = await requestJson(`/api/history/turns/${ownerMessage.turn_id}`, ownerToken);
  assert.equal(turn.response.status, 200);
  assert.equal(turn.body.data.messages.length, 2);
  assert.equal(turn.body.data.toolCalls.length, 1);
  assert.equal(turn.body.data.searchResults.length, 2);

  const localDate = await requestJson('/api/history?date=2026-11-03', ownerToken);
  assert.equal(localDate.response.status, 200);
  assert.equal(localDate.body.data.messages.length, 3);

  const utcDate = await requestJson('/api/history?date=2026-11-02', ownerToken);
  assert.equal(utcDate.response.status, 404);
});

test('returns zero-result searches and consistent pagination counts', async () => {
  const firstPage = await requestJson(
    `/api/conversations/${ownerConversation.id}/searches?page=1&limit=1`,
    ownerToken,
  );
  assert.equal(firstPage.response.status, 200);
  assert.equal(firstPage.body.data.totalSearches, 2);
  assert.equal(firstPage.body.data.pagination.totalPages, 2);
  assert.equal(firstPage.body.data.searches.length, 1);
  assert.equal(firstPage.body.data.searches[0].toolCallId, zeroResultSearch.id);
  assert.deepEqual(firstPage.body.data.searches[0].results, []);

  const secondPage = await requestJson(
    `/api/conversations/${ownerConversation.id}/searches?page=2&limit=1`,
    ownerToken,
  );
  assert.equal(secondPage.response.status, 200);
  assert.equal(secondPage.body.data.totalSearches, 2);
  assert.equal(secondPage.body.data.searches[0].toolCallId, ownerSearch.id);
  assert.equal(secondPage.body.data.searches[0].results.length, 2);
});

test('enforces ownership on all historical retrieval endpoints', async () => {
  const requests = await Promise.all([
    requestJson(`/api/conversations/${ownerConversation.id}/searches`, otherToken),
    requestJson(`/api/history/turns/${ownerMessage.turn_id}`, otherToken),
    requestJson('/api/history?date=2026-11-03', otherToken),
    requestJson('/api/history/searches?date=2026-11-03', otherToken),
  ]);

  assert.equal(requests[0].response.status, 404);
  assert.equal(requests[1].response.status, 404);
  assert.equal(requests[2].response.status, 404);
  assert.equal(requests[3].response.status, 200);
  assert.equal(requests[3].body.data.totalSearches, 0);

  const dates = await requestJson('/api/history/dates', otherToken);
  assert.equal(dates.response.status, 200);
  assert.deepEqual(dates.body.data.dates, [{
    date: '2026-11-04',
    messageCount: 1,
  }]);

  const search = await requestJson('/api/history/search?q=Redis', otherToken);
  assert.equal(search.response.status, 200);
  assert.equal(search.body.data.totalResults, 1);
  assert.equal(search.body.data.results[0].message.content, 'Private Redis search');
});

test('rejects invalid historical-search pagination', async () => {
  const response = await requestJson(
    `/api/history/searches?date=2026-11-03&page=0&limit=51`,
    ownerToken,
  );
  assert.equal(response.response.status, 400);
});
