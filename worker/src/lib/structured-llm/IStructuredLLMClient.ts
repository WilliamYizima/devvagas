import { z } from "zod";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StructuredLLMOptions {
  maxTokens?: number;
  thinking?: boolean; // ativa extended thinking para modelos que suportam
}

export interface IStructuredLLMClient {
  generateStructuredOutput<T extends z.ZodType>(
    messages: ChatMessage[],
    schema: T,
    options?: StructuredLLMOptions
  ): Promise<z.infer<T>>;
}
