import Database from 'better-sqlite3';
import { ConversationRepository } from './ConversationRepository';
import { MessageRepository } from './MessageRepository';
import { Message } from '../providers/ILLMProvider';

export class MemoryManager {
  private readonly conversationRepo: ConversationRepository;
  private readonly messageRepo: MessageRepository;
  private readonly windowSize: number;

  constructor(db: Database.Database) {
    this.conversationRepo = new ConversationRepository(db);
    this.messageRepo = new MessageRepository(db);
    this.windowSize = parseInt(process.env.MEMORY_WINDOW_SIZE ?? '20', 10);
  }

  getOrCreateConversation(userId: string): { id: string } {
    const provider = process.env.LLM_PROVIDER ?? 'gemini';
    return this.conversationRepo.getOrCreate(userId, provider);
  }

  saveMessage(conversationId: string, role: string, content: string): void {
    this.messageRepo.save(conversationId, role, content);
  }

  getRecentMessages(conversationId: string): Message[] {
    const dbMessages = this.messageRepo.getRecent(conversationId, this.windowSize);
    return dbMessages.map((m) => ({
      role: m.role as Message['role'],
      content: m.content,
    }));
  }
}
