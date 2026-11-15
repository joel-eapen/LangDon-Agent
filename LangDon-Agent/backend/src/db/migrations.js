const MIGRATIONS = [
  {
    id: '20261115_phase4_fetch_results',
    apply(database) {
      const columns = database.prepare('PRAGMA table_info(tool_calls)').all();
      const columnNames = new Set(columns.map(({ name }) => name));

      if (!columnNames.has('local_date')) {
        database.exec('ALTER TABLE tool_calls ADD COLUMN local_date TEXT');
      }
      if (!columnNames.has('timezone')) {
        database.exec('ALTER TABLE tool_calls ADD COLUMN timezone TEXT');
      }

      database.exec(`
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

        CREATE INDEX IF NOT EXISTS idx_tool_calls_conversation_tool_local_date
          ON tool_calls(conversation_id, tool_name, local_date);
        CREATE INDEX IF NOT EXISTS idx_fetch_results_tool_call
          ON fetch_results(tool_call_id);
        CREATE INDEX IF NOT EXISTS idx_fetch_results_content_hash
          ON fetch_results(content_hash);
      `);
    },
  },
];

export function applyMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of MIGRATIONS) {
    const alreadyApplied = database.prepare(
      'SELECT 1 FROM schema_migrations WHERE id = ?',
    ).get(migration.id);
    if (alreadyApplied) {
      continue;
    }

    database.transaction(() => {
      migration.apply(database);
      database.prepare(
        'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
      ).run(migration.id, new Date().toISOString());
    })();
  }
}
