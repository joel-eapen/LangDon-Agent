export const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    external_id TEXT UNIQUE,
    name TEXT,
    email TEXT,
    password_hash TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_message_at TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    turn_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    gist TEXT,
    ts_utc TEXT NOT NULL,
    timezone TEXT NOT NULL,
    local_date TEXT NOT NULL CHECK (local_date GLOB '????-??-??'),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
    message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    turn_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    arguments_json TEXT NOT NULL,
    result_summary TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'incomplete')),
    started_at TEXT NOT NULL,
    local_date TEXT,
    timezone TEXT,
    completed_at TEXT,
    duration_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS search_results (
    id TEXT PRIMARY KEY,
    tool_call_id TEXT NOT NULL REFERENCES tool_calls(id) ON DELETE RESTRICT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
    turn_id TEXT NOT NULL,
    query TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    snippet TEXT,
    source_domain TEXT,
    published_at TEXT,
    retrieved_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_digests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    local_date TEXT NOT NULL CHECK (local_date GLOB '????-??-??'),
    summary TEXT NOT NULL,
    message_count INTEGER NOT NULL CHECK (message_count >= 0),
    generated_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, local_date)
  );

  CREATE TABLE IF NOT EXISTS user_memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    memory TEXT NOT NULL,
    category TEXT,
    source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fetch_results (
    id TEXT PRIMARY KEY,
    tool_call_id TEXT NOT NULL REFERENCES tool_calls(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    turn_id TEXT,
    url TEXT NOT NULL,
    final_url TEXT,
    title TEXT,
    content TEXT,
    content_format TEXT NOT NULL DEFAULT 'markdown',
    content_hash TEXT,
    status TEXT NOT NULL,
    http_status INTEGER,
    error_message TEXT,
    retrieved_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    previous_refresh_token_hash TEXT,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
    ON conversations(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_ts
    ON messages(conversation_id, ts_utc);
  CREATE INDEX IF NOT EXISTS idx_messages_user_local_date
    ON messages(user_id, local_date);
  CREATE INDEX IF NOT EXISTS idx_messages_turn
    ON messages(turn_id);
  CREATE INDEX IF NOT EXISTS idx_messages_ts
    ON messages(ts_utc);
  CREATE INDEX IF NOT EXISTS idx_tool_calls_conversation_turn
    ON tool_calls(conversation_id, turn_id);
  CREATE INDEX IF NOT EXISTS idx_tool_calls_conversation_tool_started
    ON tool_calls(conversation_id, tool_name, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tool_calls_message
    ON tool_calls(message_id);
  CREATE INDEX IF NOT EXISTS idx_search_results_tool_call
    ON search_results(tool_call_id);
  CREATE INDEX IF NOT EXISTS idx_search_results_tool_call_retrieved
    ON search_results(tool_call_id, retrieved_at);
  CREATE INDEX IF NOT EXISTS idx_search_results_conversation_turn
    ON search_results(conversation_id, turn_id);
  CREATE INDEX IF NOT EXISTS idx_fetch_results_tool_call
    ON fetch_results(tool_call_id);
  CREATE INDEX IF NOT EXISTS idx_fetch_results_content_hash
    ON fetch_results(content_hash);
  CREATE INDEX IF NOT EXISTS idx_daily_digests_user_date
    ON daily_digests(user_id, local_date);
  CREATE INDEX IF NOT EXISTS idx_user_memories_user
    ON user_memories(user_id);

  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    gist,
    content='messages',
    content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS messages_fts_insert
  AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content, gist)
    VALUES (new.rowid, new.content, new.gist);
  END;

  CREATE TRIGGER IF NOT EXISTS messages_fts_delete
  AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content, gist)
    VALUES ('delete', old.rowid, old.content, old.gist);
  END;

  CREATE TRIGGER IF NOT EXISTS messages_fts_update
  AFTER UPDATE OF content, gist ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content, gist)
    VALUES ('delete', old.rowid, old.content, old.gist);
    INSERT INTO messages_fts(rowid, content, gist)
    VALUES (new.rowid, new.content, new.gist);
  END;
`;
