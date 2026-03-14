import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface DbMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: number;
}

export class MessageRepository {
  constructor(private readonly db: Database.Database) {}

  save(conversationId: string, role: string, content: string): DbMessage {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    // Sanitize null bytes that would break SQLite
    const safeContent = content.replace(/\u0000/g, '');
    this.db
      .prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, conversationId, role, safeContent, now);
    return { id, conversation_id: conversationId, role, content: safeContent, created_at: now };
  }

  getRecent(conversationId: string, limit: number): DbMessage[] {
    return this.db
      .prepare(
        `SELECT * FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(conversationId, limit)
      .reverse() as DbMessage[];
  }
}
