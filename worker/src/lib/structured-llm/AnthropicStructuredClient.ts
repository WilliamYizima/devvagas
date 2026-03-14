import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { IStructuredLLMClient, ChatMessage, StructuredLLMOptions } from "./IStructuredLLMClient";

export class AnthropicStructuredClient implements IStructuredLLMClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = "claude-opus-4-6") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateStructuredOutput<T extends z.ZodType>(
    messages: ChatMessage[],
    schema: T,
    options: StructuredLLMOptions = {}
  ): Promise<z.infer<T>> {
    const systemMessage = messages.find(m => m.role === "system");
    const userMessages = messages.filter(m => m.role !== "system");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonSchema: Record<string, unknown> = zodToJsonSchema(schema as any) as Record<string, unknown>;

    // Usa output_config para forçar JSON Schema nativo da API Anthropic
    const response = await (this.client.messages.create as Function)({
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: userMessages,
      output_config: {
        format: {
          type: "json_schema",
          json_schema: {
            name: "output",
            schema: jsonSchema
          }
        }
      }
    });

    const text = (response.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === "text")
      .map(b => b.text ?? "")
      .join("");

    const parsed = JSON.parse(text);
    return schema.parse(parsed); // Zod valida em runtime
  }
}
