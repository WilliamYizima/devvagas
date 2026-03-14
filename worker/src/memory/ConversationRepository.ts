import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface Conversation {
  id: string;
  user_id: string;
  provider: string;
  created_at: number;
}

export class ConversationRepository {
  constructor(private readonly db: Database.Database) {}

  findByUserId(userId: string): Conversation | undefined {
    return this.db
      .prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(userId) as Conversation | undefined;
  }

  create(userId: string, provider: string): Conversation {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare('INSERT INTO conversations (id, user_id, provider, created_at) VALUES (?, ?, ?, ?)')
      .run(id, userId, provider, now);
    return { id, user_id: userId, provider, created_at: now };
  }

  getOrCreate(userId: string, provider: string): Conversation {
    return this.findByUserId(userId) ?? this.create(userId, provider);
  }
}
