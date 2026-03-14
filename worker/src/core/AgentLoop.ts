import { ILLMProvider, Message } from '../providers/ILLMProvider';
import { ToolRegistry } from './ToolRegistry';

export interface AgentResult {
  answer: string;
  isFile: boolean;
  filename?: string;
  isAudio: boolean;
}

export class AgentLoop {
  private readonly maxIterations: number;

  constructor(
    private readonly provider: ILLMProvider,
    private readonly toolRegistry: ToolRegistry,
  ) {
    this.maxIterations = parseInt(process.env.MAX_ITERATIONS ?? '5', 10);
  }

  async run(
    messages: Message[],
    systemPrompt: string,
    requiresAudioReply: boolean,
  ): Promise<AgentResult> {
    const toolDefs = this.toolRegistry.getDefinitions();

    const loopMessages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;
      console.log(`[AgentLoop] Iteration ${iterations}/${this.maxIterations}`);

      const response = await this.provider.chat(loopMessages, toolDefs.length ? toolDefs : undefined);

      if (response.finish_reason === 'tool_calls' && response.tool_calls?.length) {
        loopMessages.push({
          role: 'assistant',
          content: null,
          tool_calls: response.tool_calls,
        });

        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.function.name;
          console.log(`[AgentLoop] Action: calling tool "${toolName}"`);

          const tool = this.toolRegistry.get(toolName);
          let observation: string;

          if (!tool) {
            observation = `Tool "${toolName}" not found in registry.`;
            console.warn(`[AgentLoop] Observation (error): ${observation}`);
          } else {
            try {
              const args = this.safeParseArgs(toolCall.function.arguments);
              observation = await tool.execute(args);
              console.log(`[AgentLoop] Observation: ${observation}`);
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              observation = `Tool execution error: ${errMsg}`;
              console.error(`[AgentLoop] Observation (error): ${observation}`);
            }
          }

          loopMessages.push({
            role: 'tool',
            content: observation,
            name: toolName,
            tool_call_id: toolCall.id,
          });
        }

        continue;
      }

      const answer = response.content ?? '';
      console.log(`[AgentLoop] Final answer reached after ${iterations} iteration(s).`);
      return this.buildResult(answer, requiresAudioReply);
    }

    const fallback =
      'Desculpe, não consegui concluir sua solicitação dentro do limite de iterações do agente. Tente reformular o pedido.';
    console.warn(`[AgentLoop] Max iterations (${this.maxIterations}) reached.`);
    return this.buildResult(fallback, requiresAudioReply);
  }

  private buildResult(answer: string, requiresAudioReply: boolean): AgentResult {
    // Detect file output marker: [ARQUIVO:filename.ext]
    const fileMatch = answer.match(/^\[ARQUIVO:([^\]]+)\]/);
    if (fileMatch) {
      const filename = fileMatch[1].trim();
      const cleanAnswer = answer.slice(fileMatch[0].length).trim();
      return { answer: cleanAnswer, isFile: true, filename, isAudio: false };
    }
    return { answer, isFile: false, isAudio: requiresAudioReply };
  }

  private safeParseArgs(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
