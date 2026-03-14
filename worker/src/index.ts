import 'dotenv/config';
import { Bot } from 'grammy';
import { DatabaseSingleton } from './memory/Database';
import { MemoryManager } from './memory/MemoryManager';
import { AgentController } from './core/AgentController';
import { TelegramInputHandler } from './handlers/TelegramInputHandler';
import { TelegramOutputHandler } from './handlers/TelegramOutputHandler';

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('FATAL: TELEGRAM_BOT_TOKEN is not set. Check your .env file.');
    process.exit(1);
  }

  console.log('[Boro] Starting...');

  const db = DatabaseSingleton.getInstance();
  const memoryManager = new MemoryManager(db);
  const outputHandler = new TelegramOutputHandler();
  const controller = new AgentController(memoryManager, outputHandler);

  const bot = new Bot(token);
  const inputHandler = new TelegramInputHandler(bot, controller);
  inputHandler.register();

  bot.catch((err) => {
    console.error('[Bot] Unhandled error:', err.message);
  });

  console.log('[Boro] Bot is running. Waiting for messages...');
  await bot.start();
}

main().catch((err) => {
  console.error('[Boro] Fatal startup error:', err);
  process.exit(1);
});
