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

export default db;