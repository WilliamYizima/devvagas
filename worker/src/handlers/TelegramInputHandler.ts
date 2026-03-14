import { Bot, Context } from 'grammy';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { AgentController } from '../core/AgentController';

const execFileAsync = promisify(execFile);

export class TelegramInputHandler {
  private readonly allowedUserIds: Set<string>;
  private readonly tmpDir: string;

  constructor(
    private readonly bot: Bot<Context>,
    private readonly controller: AgentController,
  ) {
    const rawIds = process.env.TELEGRAM_ALLOWED_USER_IDS ?? '';
    this.allowedUserIds = new Set(rawIds.split(',').map((id) => id.trim()).filter(Boolean));
    this.tmpDir = process.env.TMP_DIR ?? './tmp';
    fs.mkdirSync(this.tmpDir, { recursive: true });
  }

  register(): void {
    this.checkDependencies().catch(() => { /* already logged */ });

    this.bot.on('message:text', async (ctx) => {
      if (!this.isAllowed(ctx)) return;
      await ctx.replyWithChatAction('typing');
      const text = ctx.message.text ?? '';
      const requiresAudioReply = this.detectAudioRequest(text);
      await this.controller.handle(ctx, String(ctx.from!.id), text, requiresAudioReply);
    });

    this.bot.on(['message:voice', 'message:audio'], async (ctx) => {
      if (!this.isAllowed(ctx)) return;
      await ctx.replyWithChatAction('record_voice');
      const fileId = ctx.message.voice?.file_id ?? ctx.message.audio?.file_id ?? '';
      try {
        const text = await this.transcribeAudio(ctx, fileId);
        if (!text) { await ctx.reply('Áudio vazio captado. Pode reenviar?'); return; }
        await this.controller.handle(ctx, String(ctx.from!.id), text, true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`⚠️ Falha ao processar o áudio: ${msg}`);
      }
    });

    this.bot.on('message:document', async (ctx) => {
      if (!this.isAllowed(ctx)) return;
      await ctx.replyWithChatAction('typing');

      const doc = ctx.message.document;
      const mime = doc?.mime_type ?? '';
      const fileName = doc?.file_name ?? '';
      const isPdf = mime === 'application/pdf';
      const isMd = fileName.toLowerCase().endsWith('.md');

      if (!isPdf && !isMd) {
        await ctx.reply('⚠️ No momento, só consigo processar texto estruturado (.md), áudio e PDF.');
        return;
      }

      try {
        const text = await this.extractDocument(ctx, doc!.file_id, isPdf);
        const caption = ctx.message.caption ?? '';
        const fullText = caption ? `${caption}\n\n${text}` : text;
        await this.controller.handle(ctx, String(ctx.from!.id), fullText, false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`⚠️ Falha ao processar o documento: ${msg}`);
      }
    });
  }

  private isAllowed(ctx: Context): boolean {
    const userId = String(ctx.from?.id ?? '');
    if (!this.allowedUserIds.has(userId)) {
      console.log(`[InputHandler] Rejected request from unlisted user: ${userId}`);
      return false;
    }
    return true;
  }

  private detectAudioRequest(text: string): boolean {
    return /responda em áudio|fale comigo|resposta em voz|me responde em áudio/i.test(text);
  }

  private async transcribeAudio(ctx: Context, fileId: string): Promise<string> {
    const telegramFile = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${telegramFile.file_path}`;
    const ext = path.extname(telegramFile.file_path ?? '.ogg') || '.ogg';
    const tmpFile = path.join(this.tmpDir, `audio_${Date.now()}${ext}`);

    try {
      await this.downloadFile(fileUrl, tmpFile);
      return await this.runWhisper(tmpFile);
    } finally {
      this.safeDelete(tmpFile);
    }
  }

  private async extractDocument(ctx: Context, fileId: string, isPdf: boolean): Promise<string> {
    const telegramFile = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${telegramFile.file_path}`;
    const ext = isPdf ? '.pdf' : '.md';
    const tmpFile = path.join(this.tmpDir, `doc_${Date.now()}${ext}`);

    try {
      await this.downloadFile(fileUrl, tmpFile);
      if (ext === '.md') return fs.readFileSync(tmpFile, 'utf-8');

      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
      const buffer = fs.readFileSync(tmpFile);
      if (buffer.length > 20 * 1024 * 1024) {
        throw new Error('PDF excede o limite de 20MB suportado para extração local.');
      }
      const data = await pdfParse(buffer);
      return data.text;
    } finally {
      this.safeDelete(tmpFile);
    }
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    const https = require('https') as typeof import('https');
    const http = require('http') as typeof import('http');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Download timeout após 15s')), 15_000);
      const protocol = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(dest);

      protocol.get(url, (res) => {
        res.pipe(file);
        file.on('finish', () => { clearTimeout(timeout); file.close(); resolve(); });
      }).on('error', (err) => { clearTimeout(timeout); this.safeDelete(dest); reject(err); });
    });
  }

  private async runWhisper(audioPath: string): Promise<string> {
    const outputDir = path.dirname(audioPath);
    const basename = path.basename(audioPath, path.extname(audioPath));
    const outputTxt = path.join(outputDir, `${basename}.txt`);

    try {
      await execFileAsync(
        'whisper',
        [audioPath, '--model', 'base', '--output_format', 'txt', '--output_dir', outputDir],
        { timeout: 60_000 },
      );
      if (!fs.existsSync(outputTxt)) throw new Error('Whisper não gerou arquivo de transcrição');
      const text = fs.readFileSync(outputTxt, 'utf-8').trim();
      console.log(`[InputHandler] Transcript: ${text}`);
      return text;
    } catch (err) {
      throw new Error(
        `⚠️ Não consegui inicializar o Whisper local agora. Verifique se o Whisper está instalado. (${err instanceof Error ? err.message : err})`,
      );
    } finally {
      this.safeDelete(outputTxt);
    }
  }

  private async checkDependencies(): Promise<void> {
    const check = async (bin: string): Promise<boolean> => {
      try { await execFileAsync('which', [bin], { timeout: 5_000 }); return true; }
      catch { return false; }
    };

    const [whisperOk, ffmpegOk] = await Promise.all([check('whisper'), check('ffmpeg')]);
    if (!whisperOk) console.warn('[InputHandler] ⚠️  "whisper" not found. Install: pip install openai-whisper');
    if (!ffmpegOk) console.warn('[InputHandler] ⚠️  "ffmpeg" not found. Install: brew install ffmpeg');
    if (whisperOk && ffmpegOk) console.log('[InputHandler] Dependencies OK: whisper, ffmpeg');
  }

  private safeDelete(filePath: string): void {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
}
