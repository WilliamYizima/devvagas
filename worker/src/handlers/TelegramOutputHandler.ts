import { Context, InputFile } from 'grammy';
import * as fs from 'fs';
import * as path from 'path';
import { AgentResult } from '../core/AgentLoop';

const MAX_TELEGRAM_LENGTH = 4096;

export class TelegramOutputHandler {
  private readonly tmpDir: string;

  constructor() {
    this.tmpDir = process.env.TMP_DIR ?? './tmp';
    fs.mkdirSync(this.tmpDir, { recursive: true });
  }

  async send(ctx: Context, result: AgentResult): Promise<void> {
    try {
      if (result.isFile && result.filename) {
        await this.sendAsFile(ctx, result.answer, result.filename);
        return;
      }
      if (result.isAudio) {
        const sent = await this.sendAsAudio(ctx, result.answer);
        if (sent) return;
        // Fall through to text on TTS failure
      }
      await this.sendAsText(ctx, result.answer);
    } catch (err) {
      if (this.isBotBlocked(err)) {
        console.warn('[OutputHandler] Message abandoned — user blocked the bot.');
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      try {
        await ctx.reply(`⚠️ Erro ao enviar resposta: ${msg}`);
      } catch { /* ignore */ }
    }
  }

  async sendError(ctx: Context, message: string): Promise<void> {
    try {
      await ctx.reply(`⚠️ ${message}`);
    } catch { /* ignore */ }
  }

  private async sendAsText(ctx: Context, text: string): Promise<void> {
    for (const chunk of this.chunkText(text)) {
      await ctx.reply(chunk);
    }
  }

  private async sendAsFile(ctx: Context, content: string, filename: string): Promise<void> {
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const tmpPath = path.join(this.tmpDir, safeFilename);

    try {
      fs.writeFileSync(tmpPath, content, 'utf-8');
      await ctx.replyWithDocument(new InputFile(tmpPath, safeFilename), { caption: `📄 ${safeFilename}` });
    } catch (err) {
      console.error('[OutputHandler] File send failed, falling back to text chunks:', err);
      await ctx.reply('Não consegui gerar o arquivo, segue o texto:');
      await this.sendAsText(ctx, content);
    } finally {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }

  private async sendAsAudio(ctx: Context, text: string): Promise<boolean> {
    try {
      await ctx.replyWithChatAction('record_voice');
      const cleanText = this.stripMarkdown(text);

      const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts') as { MsEdgeTTS: any; OUTPUT_FORMAT: any };
      const tts = new MsEdgeTTS();
      await tts.setMetadata('pt-BR-ThalitaMultilingualNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

      const tmpAudio = path.join(this.tmpDir, `tts_${Date.now()}.mp3`);
      await tts.toFile(tmpAudio, cleanText);

      try {
        await ctx.replyWithVoice(new InputFile(tmpAudio));
      } finally {
        try { if (fs.existsSync(tmpAudio)) fs.unlinkSync(tmpAudio); } catch { /* ignore */ }
      }

      return true;
    } catch (err) {
      console.warn('[OutputHandler] TTS failed, falling back to text:', err);
      return false;
    }
  }

  private chunkText(text: string): string[] {
    if (text.length <= MAX_TELEGRAM_LENGTH) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_TELEGRAM_LENGTH) { chunks.push(remaining); break; }
      let cutAt = remaining.lastIndexOf('\n', MAX_TELEGRAM_LENGTH);
      if (cutAt <= 0) cutAt = MAX_TELEGRAM_LENGTH;
      chunks.push(remaining.slice(0, cutAt));
      remaining = remaining.slice(cutAt).trimStart();
    }

    return chunks;
  }

  private stripMarkdown(text: string): string {
    return text
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/_/g, '')
      .replace(/`{1,3}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
  }

  private isBotBlocked(err: unknown): boolean {
    if (err instanceof Error) {
      return err.message.includes('Forbidden') || err.message.includes('bot was blocked');
    }
    return false;
  }
}
