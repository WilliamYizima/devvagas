import { Context } from 'grammy';
import { MemoryManager } from '../memory/MemoryManager';
import { TelegramOutputHandler } from '../handlers/TelegramOutputHandler';
import { ExecutionContext } from '../lib/ExecutionContext';
import { createVacancyWorkflow } from '../skills-impl/tech-recruiter/workflow';

export class AgentController {
  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly outputHandler: TelegramOutputHandler,
  ) {}

  async handle(
    ctx: Context,
    userId: string,
    userText: string,
    _requiresAudioReply?: boolean,
  ): Promise<void> {
    try {
      const conversation = this.memoryManager.getOrCreateConversation(userId);
      this.memoryManager.saveMessage(conversation.id, 'user', userText);

      ExecutionContext.setUserText(userText);

      const workflow = createVacancyWorkflow();
      const result = await workflow.run(userText);

      let answer: string;
      if (result.success) {
        const id = result.url?.split('#')[1] ?? '?';
        answer = [`✅ Vaga criada com sucesso!`, `🆔 ID: #${id}`, `📊 Tentativas necessárias: ${result.retries + 1}`].join('\n');
      } else {
        answer = [`❌ Não foi possível processar a vaga após ${result.retries + 1} tentativas.`, `Motivo: ${result.error}`, `Sugestão: Verifique se o texto contém informações suficientes sobre a vaga.`].join('\n');
      }

      this.memoryManager.saveMessage(conversation.id, 'assistant', answer);
      await this.outputHandler.send(ctx, { answer, isFile: false, isAudio: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[AgentController] Error during handle:', msg);
      await this.outputHandler.sendError(ctx, `Falha ao processar sua mensagem. Tente novamente.`);
    }
  }
}
