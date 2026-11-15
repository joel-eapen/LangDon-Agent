import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { mock } from 'node:test';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'langdon-search-'));
process.env.DB_PATH = path.join(temporaryDirectory, 'test.sqlite');

const { default: db } = await import('../../db/index.js');
const repository = await import('../../db/repositories.js');
const { default: tinyfish } = await import('../../config/tinyfish.js');
const { searchWeb } = await import('./search.service.js');

test.after(() => {
  mock.restoreAll();
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('searchWeb persists the tool call and every returned search result', async () => {
  const user = repository.createUser({ timezone: 'Asia/Kolkata' });
  const conversation = repository.createConversation({ userId: user.id });
  const response = {
    results: [
      {
        title: 'SQLite Documentation',
        url: 'https://sqlite.org/docs.html',
        snippet: 'SQLite documentation',
        site_name: 'sqlite.org',
      },
      {
        title: 'SQLite Homepage',
        url: 'https://sqlite.org',
        snippet: 'SQLite is a small database engine',
        site_name: 'sqlite.org',
      },
    ],
  };
  const queryMock = mock.method(tinyfish.search, 'query', async ({ query }) => {
    assert.equal(query, 'SQLite documentation');
    return response;
  });

  const result = await searchWeb({
    userId: user.id,
    conversationId: conversation.id,
    turnId: 'search-turn-1',
    query: 'SQLite documentation',
  });

  assert.equal(queryMock.mock.callCount(), 1);
  assert.equal(result.results.length, 2);
  assert.equal(result.toolCall.status, 'completed');
  assert.equal(result.toolCall.result_summary, 'Stored 2 search result(s)');

  const storedResults = repository.listSearchResultsByToolCall(result.toolCall.id);
  assert.equal(storedResults.length, 2);
  assert.deepEqual(
    storedResults.map(({ title, url }) => ({ title, url })),
    response.results.map(({ title, url }) => ({ title, url })),
  );
});

test('searchWeb marks the tool call failed and rethrows TinyFish errors', async () => {
  const user = repository.createUser();
  const conversation = repository.createConversation({ userId: user.id });
  const error = new Error('TinyFish request failed');
  mock.restoreAll();
  mock.method(tinyfish.search, 'query', async () => {
    throw error;
  });

  await assert.rejects(
    searchWeb({
      userId: user.id,
      conversationId: conversation.id,
      turnId: 'search-turn-2',
      query: 'unavailable service',
    }),
    (receivedError) => receivedError === error,
  );

  const failedToolCall = repository.listToolCallsByTurn('search-turn-2')[0];
  assert.equal(failedToolCall.status, 'failed');
  assert.equal(failedToolCall.result_summary, error.message);
  assert.ok(failedToolCall.completed_at);
  assert.equal(failedToolCall.duration_ms >= 0, true);
});
