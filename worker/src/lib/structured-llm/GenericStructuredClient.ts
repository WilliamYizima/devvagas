import { ILLMProvider } from "../../providers/ILLMProvider";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { IStructuredLLMClient, ChatMessage, StructuredLLMOptions } from "./IStructuredLLMClient";

export class GenericStructuredClient implements IStructuredLLMClient {
  constructor(private provider: ILLMProvider) {}

  async generateStructuredOutput<T extends z.ZodType>(
    messages: ChatMessage[],
    schema: T,
    _options: StructuredLLMOptions = {}
  ): Promise<z.infer<T>> {
    // Injeta o schema no system prompt como JSON Schema
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonSchema = JSON.stringify(zodToJsonSchema(schema as any), null, 2);
    const schemaInstruction = [
      "Você DEVE retornar APENAS um objeto JSON válido que satisfaça exatamente o seguinte schema:",
      "```json",
      jsonSchema,
      "```",
      "Não inclua explicações, markdown ou texto fora do JSON."
    ].join("\n");

    const augmentedMessages = messages.map(m =>
      m.role === "system"
        ? { ...m, content: `${m.content}\n\n${schemaInstruction}` }
        : m
    );

    const response = await this.provider.chat(
      augmentedMessages.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content }))
    );

    const raw = response.content ?? "";
    // Extrai JSON mesmo se o modelo adicionar texto ao redor
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Nenhum JSON encontrado na resposta do LLM");

    const parsed = this.parseResilient(jsonMatch[0]);
    return schema.parse(parsed);
  }

  private parseResilient(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      // Resiliência: corrige control chars não escapados (quirk de modelos locais)
      const fixed = raw.replace(/[\x00-\x1F\x7F]/g, ch =>
        ch === "\n" || ch === "\r" || ch === "\t" ? ch : `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`
      );
      return JSON.parse(fixed);
    }
  }
}
