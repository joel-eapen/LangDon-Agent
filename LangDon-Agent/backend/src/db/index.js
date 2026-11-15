import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { schema } from './schema.js';

const configuredPath = process.env.DB_PATH || './data/langdon.sqlite';
const databasePath = path.resolve(process.cwd(), configuredPath);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.exec(schema);
db.exec(`INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')`);

const userColumns = db.prepare('PRAGMA table_info(users)').all();
const existingUserColumns = new Set(userColumns.map(({ name }) => name));

for (const [name, definition] of [
  ['name', 'TEXT'],
  ['email', 'TEXT'],
  ['password_hash', 'TEXT'],
]) {
  if (!existingUserColumns.has(name)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
}

db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL');

export default db;