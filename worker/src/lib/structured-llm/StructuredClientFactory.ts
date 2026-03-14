import { IStructuredLLMClient } from "./IStructuredLLMClient";
import { AnthropicStructuredClient } from "./AnthropicStructuredClient";
import { GenericStructuredClient } from "./GenericStructuredClient";
import { ProviderFactory } from "../../providers/ProviderFactory";

/**
 * Retorna um IStructuredLLMClient adequado ao ambiente:
 * - Se ANTHROPIC_API_KEY está configurada → AnthropicStructuredClient (structured output nativo)
 * - Caso contrário → GenericStructuredClient com o provider configurado (Ollama, Gemini, etc.)
 */
export function createStructuredClient(model?: string): IStructuredLLMClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const isValidKey = apiKey && !apiKey.startsWith("your_");

  if (isValidKey) {
    return new AnthropicStructuredClient(apiKey, model);
  }

  console.log("[StructuredClientFactory] ANTHROPIC_API_KEY não configurada — usando GenericStructuredClient com provider local.");
  const provider = ProviderFactory.create();
  return new GenericStructuredClient(provider);
}
