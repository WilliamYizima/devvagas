import OpenAI from 'openai';
import { ILLMProvider, Message, ToolDefinition, LLMResponse } from './ILLMProvider';

export class OllamaProvider implements ILLMProvider {
  private readonly client: OpenAI;
  private readonly modelName: string;

  constructor(modelName: string, baseURL = 'http://localhost:11434/v1') {
    // Strip "ollama/" prefix if present
    this.modelName = modelName.replace(/^ollama\//, '');
    this.client = new OpenAI({ apiKey: 'ollama', baseURL });
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool', content: m.content ?? '', tool_call_id: m.tool_call_id ?? '' };
      }
      if (m.role === 'assistant' && m.tool_calls?.length) {
        return {
          role: 'assistant',
          content: m.content ?? null,
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        };
      }
      return { role: m.role as 'user' | 'assistant' | 'system', content: m.content ?? '' };
    });

    const openaiTools: OpenAI.Chat.ChatCompletionTool[] | undefined = tools?.length
      ? tools.map((t) => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }))
      : undefined;

    const response = await this.client.chat.completions.create({
      model: this.modelName,
      messages: openaiMessages,
      tools: openaiTools,
    });

    const choice = response.choices[0];
    const msg = choice.message;

    if (msg.tool_calls?.length) {
      return {
        content: null,
        tool_calls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
        finish_reason: 'tool_calls',
      };
    }

    return {
      content: msg.content ?? '',
      finish_reason: (choice.finish_reason as LLMResponse['finish_reason']) ?? 'stop',
    };
  }
}
