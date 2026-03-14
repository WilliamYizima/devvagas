import { ILLMProvider } from './ILLMProvider';
import { GeminiProvider } from './GeminiProvider';
import { DeepSeekProvider } from './DeepSeekProvider';
import { OllamaProvider } from './OllamaProvider';

export class ProviderFactory {
  static create(): ILLMProvider {
    const modelName = process.env.LLM_MODEL_NAME;
    if (modelName?.startsWith('ollama/')) {
      return new OllamaProvider(modelName, process.env.OLLAMA_BASE_URL);
    }

    const providerName = (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();

    switch (providerName) {
      case 'gemini': {
        const key = process.env.GEMINI_API_KEY;
        if (!key) throw new Error('GEMINI_API_KEY not set in environment');
        return new GeminiProvider(key, process.env.GEMINI_MODEL);
      }
      case 'deepseek': {
        const key = process.env.DEEPSEEK_API_KEY;
        if (!key) throw new Error('DEEPSEEK_API_KEY not set in environment');
        return new DeepSeekProvider(key, process.env.DEEPSEEK_MODEL);
      }
      default:
        throw new Error(`Unsupported LLM_PROVIDER: "${providerName}". Use "gemini" or "deepseek".`);
    }
  }

  /** Lightweight provider for skill routing decisions. Uses same configured provider. */
  static createRouter(): ILLMProvider {
    return ProviderFactory.create();
  }
}
