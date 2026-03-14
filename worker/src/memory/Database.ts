import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export class DatabaseSingleton {
  private static instance: Database.Database;

  private constructor() {}

  static getInstance(): Database.Database {
    if (!DatabaseSingleton.instance) {
      const dbPath = process.env.DB_PATH ?? './data/Boro.db';
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      DatabaseSingleton.instance = new Database(dbPath);
      DatabaseSingleton.instance.pragma('journal_mode = WAL');
      DatabaseSingleton.instance.pragma('foreign_keys = OFF');
      DatabaseSingleton.bootstrap(DatabaseSingleton.instance);
    }
    return DatabaseSingleton.instance;
  }

  private static bootstrap(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages (conversation_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_conversations_user
        ON conversations (user_id);
    `);
  }
}
