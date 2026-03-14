import { GoogleGenerativeAI, Content, Part, FunctionDeclaration, Tool } from '@google/generative-ai';
import { ILLMProvider, Message, ToolDefinition, LLMResponse } from './ILLMProvider';

export class GeminiProvider implements ILLMProvider {
  private readonly client: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(apiKey: string, model = 'gemini-2.0-flash') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = model;
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const systemMessage = messages.find((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const geminiTools: Tool[] | undefined = tools?.length
      ? [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters as unknown as FunctionDeclaration['parameters'],
            })),
          },
        ]
      : undefined;

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemMessage?.content ?? undefined,
      tools: geminiTools,
    });

    const contents: Content[] = this.convertMessages(nonSystemMessages);
    const result = await model.generateContent({ contents });
    const response = result.response;
    const candidate = response.candidates?.[0];

    if (!candidate) {
      return { content: 'No response received from Gemini.', finish_reason: 'error' };
    }

    const parts = candidate.content.parts;
    const functionCallPart = parts.find((p: Part) => 'functionCall' in p && p.functionCall);

    if (functionCallPart && 'functionCall' in functionCallPart && functionCallPart.functionCall) {
      const fc = functionCallPart.functionCall;
      return {
        content: null,
        tool_calls: [
          {
            id: `call_${Date.now()}`,
            type: 'function',
            function: {
              name: fc.name,
              arguments: JSON.stringify(fc.args ?? {}),
            },
          },
        ],
        finish_reason: 'tool_calls',
      };
    }

    const textPart = parts.find((p: Part) => 'text' in p && p.text);
    const text = textPart && 'text' in textPart ? textPart.text : '';
    return { content: text ?? '', finish_reason: 'stop' };
  }

  private convertMessages(messages: Message[]): Content[] {
    const contents: Content[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.content ?? '' }] });
      } else if (msg.role === 'assistant') {
        if (msg.tool_calls?.length) {
          const tc = msg.tool_calls[0];
          contents.push({
            role: 'model',
            parts: [{ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments) } }],
          });
        } else {
          contents.push({ role: 'model', parts: [{ text: msg.content ?? '' }] });
        }
      } else if (msg.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: msg.name ?? '', response: { output: msg.content ?? '' } } }],
        });
      }
    }

    return contents;
  }
}
