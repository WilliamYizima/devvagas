# Spec: Boro Core — Infraestrutura Base

**Versão:** 1.0
**Status:** Referência
**Autor:** Boro Agent
**Data:** 2026-03-13

---

## 1. Resumo

Este documento contém o código **completo e copiável** de toda a infraestrutura base do Boro. É a única fonte necessária para criar o projeto do zero — sem depender de nenhum arquivo pré-existente. Todo código foi extraído do projeto em produção e está pronto para uso.

Após implementar este documento, o projeto estará funcional para receber os arquivos do pipeline multi-agente descritos nos demais documentos do `boilerplate/`.

---

## 2. Estrutura de Pastas a Criar

```bash
mkdir -p src/{core,handlers,memory,providers,skills,tools}
mkdir -p .agents/skills/general-assistant
mkdir -p data tmp
```

---

## 3. Providers — Abstração de LLM

### `src/providers/ILLMProvider.ts`

```typescript
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  role: MessageRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type FinishReason = 'stop' | 'tool_calls' | 'max_tokens' | 'error';

export interface LLMResponse {
  content: string | null;
  tool_calls?: ToolCall[];
  finish_reason: FinishReason;
}

export interface ILLMProvider {
  chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}
```

---

### `src/providers/GeminiProvider.ts`

```typescript
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
```

---

### `src/providers/DeepSeekProvider.ts`

```typescript
import OpenAI from 'openai';
import { ILLMProvider, Message, ToolDefinition, LLMResponse } from './ILLMProvider';

export class DeepSeekProvider implements ILLMProvider {
  private readonly client: OpenAI;
  private readonly modelName: string;

  constructor(apiKey: string, model = 'deepseek-chat') {
    this.client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
    this.modelName = model;
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
```

---

### `src/providers/OllamaProvider.ts`

```typescript
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
```

---

### `src/providers/ProviderFactory.ts`

```typescript
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
```

---

## 4. Memory — Persistência SQLite

### `src/memory/Database.ts`

```typescript
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export class DatabaseSingleton {
  private static instance: Database.Database;

  private constructor() {}

  static getInstance(): Database.Database {
    if (!DatabaseSingleton.instance) {
      const dbPath = process.env.DB_PATH ?? './data/Boro.db';
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      DatabaseSingleton.instance = new Database(dbPath);
      DatabaseSingleton.instance.pragma('journal_mode = WAL');
      DatabaseSingleton.instance.pragma('foreign_keys = OFF');
      DatabaseSingleton.bootstrap(DatabaseSingleton.instance);
    }
    return DatabaseSingleton.instance;
  }

  private static bootstrap(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages (conversation_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_conversations_user
        ON conversations (user_id);
    `);
  }
}
```

---

### `src/memory/ConversationRepository.ts`

```typescript
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface Conversation {
  id: string;
  user_id: string;
  provider: string;
  created_at: number;
}

export class ConversationRepository {
  constructor(private readonly db: Database.Database) {}

  findByUserId(userId: string): Conversation | undefined {
    return this.db
      .prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(userId) as Conversation | undefined;
  }

  create(userId: string, provider: string): Conversation {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare('INSERT INTO conversations (id, user_id, provider, created_at) VALUES (?, ?, ?, ?)')
      .run(id, userId, provider, now);
    return { id, user_id: userId, provider, created_at: now };
  }

  getOrCreate(userId: string, provider: string): Conversation {
    return this.findByUserId(userId) ?? this.create(userId, provider);
  }
}
```

---

### `src/memory/MessageRepository.ts`

```typescript
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface DbMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: number;
}

export class MessageRepository {
  constructor(private readonly db: Database.Database) {}

  save(conversationId: string, role: string, content: string): DbMessage {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    // Sanitize null bytes that would break SQLite
    const safeContent = content.replace(/\u0000/g, '');
    this.db
      .prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, conversationId, role, safeContent, now);
    return { id, conversation_id: conversationId, role, content: safeContent, created_at: now };
  }

  getRecent(conversationId: string, limit: number): DbMessage[] {
    return this.db
      .prepare(
        `SELECT * FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(conversationId, limit)
      .reverse() as DbMessage[];
  }
}
```

---

### `src/memory/MemoryManager.ts`

```typescript
import Database from 'better-sqlite3';
import { ConversationRepository } from './ConversationRepository';
import { MessageRepository } from './MessageRepository';
import { Message } from '../providers/ILLMProvider';

export class MemoryManager {
  private readonly conversationRepo: ConversationRepository;
  private readonly messageRepo: MessageRepository;
  private readonly windowSize: number;

  constructor(db: Database.Database) {
    this.conversationRepo = new ConversationRepository(db);
    this.messageRepo = new MessageRepository(db);
    this.windowSize = parseInt(process.env.MEMORY_WINDOW_SIZE ?? '20', 10);
  }

  getOrCreateConversation(userId: string): { id: string } {
    const provider = process.env.LLM_PROVIDER ?? 'gemini';
    return this.conversationRepo.getOrCreate(userId, provider);
  }

  saveMessage(conversationId: string, role: string, content: string): void {
    this.messageRepo.save(conversationId, role, content);
  }

  getRecentMessages(conversationId: string): Message[] {
    const dbMessages = this.messageRepo.getRecent(conversationId, this.windowSize);
    return dbMessages.map((m) => ({
      role: m.role as Message['role'],
      content: m.content,
    }));
  }
}
```

---

## 5. Tools — Ferramentas do Agente

### `src/tools/BaseTool.ts`

```typescript
import { ToolDefinition } from '../providers/ILLMProvider';

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: Record<string, unknown>;

  abstract execute(args: Record<string, unknown>): Promise<string>;

  toDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    };
  }
}
```

---

### `src/tools/CreateFileTool.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './BaseTool';

export class CreateFileTool extends BaseTool {
  readonly name = 'create_file';
  readonly description =
    'Creates a file at the given path with the specified content. Use this to persist documents, specs, code, or any text output to disk.';
  readonly parameters = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Relative or absolute path where the file should be created.',
      },
      content: {
        type: 'string',
        description: 'Full text content to write to the file.',
      },
    },
    required: ['file_path', 'content'],
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const filePath = args['file_path'] as string;
    const content = args['content'] as string;

    if (!filePath || typeof filePath !== 'string') {
      throw new Error('file_path must be a non-empty string');
    }

    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');

    return `File created successfully at: ${filePath}`;
  }
}
```

---

## 6. Core — Motor do Agente

### `src/core/ToolRegistry.ts`

```typescript
import { BaseTool } from '../tools/BaseTool';
import { ToolDefinition } from '../providers/ILLMProvider';

export class ToolRegistry {
  private readonly tools = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.toDefinition());
  }

  getAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }
}
```

---

### `src/core/AgentLoop.ts`

```typescript
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
```

---

### `src/core/AgentController.ts`

```typescript
import { Context } from 'grammy';
import { AgentLoop } from './AgentLoop';
import { MemoryManager } from '../memory/MemoryManager';
import { SkillLoader } from '../skills/SkillLoader';
import { SkillRouter } from '../skills/SkillRouter';
import { SkillExecutor } from '../skills/SkillExecutor';
import { TelegramOutputHandler } from '../handlers/TelegramOutputHandler';

export class AgentController {
  private readonly skillExecutor: SkillExecutor;

  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly agentLoop: AgentLoop,
    private readonly skillLoader: SkillLoader,
    private readonly skillRouter: SkillRouter,
    private readonly outputHandler: TelegramOutputHandler,
  ) {
    this.skillExecutor = new SkillExecutor();
  }

  async handle(
    ctx: Context,
    userId: string,
    userText: string,
    requiresAudioReply: boolean,
  ): Promise<void> {
    try {
      const conversation = this.memoryManager.getOrCreateConversation(userId);
      this.memoryManager.saveMessage(conversation.id, 'user', userText);
      const messages = this.memoryManager.getRecentMessages(conversation.id);

      const skills = this.skillLoader.load();
      const skillName = await this.skillRouter.route(userText, skills);

      const matchedSkill = skills.find((s) => s.name === skillName) ?? null;
      const skillContext = this.skillExecutor.buildContext(matchedSkill);

      if (skillContext.skillName) {
        console.log(`[AgentController] Skill activated: ${skillContext.skillName}`);
      } else {
        console.log('[AgentController] No skill matched — using default assistant mode.');
      }

      const result = await this.agentLoop.run(messages, skillContext.systemPrompt, requiresAudioReply);
      this.memoryManager.saveMessage(conversation.id, 'assistant', result.answer);
      await this.outputHandler.send(ctx, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[AgentController] Error during handle:', msg);
      await this.outputHandler.sendError(ctx, `Falha ao processar sua mensagem. Tente novamente.`);
    }
  }
}
```

---

## 7. Skills — Sistema de Plugins

### `src/skills/SkillLoader.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

export interface SkillMeta {
  name: string;
  description: string;
}

export interface Skill extends SkillMeta {
  content: string;
}

export class SkillLoader {
  private readonly skillsDir: string;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir ?? process.env.SKILLS_DIR ?? './.agents/skills';
  }

  load(): Skill[] {
    if (!fs.existsSync(this.skillsDir)) return [];

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    const skills: Skill[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillFile = path.join(this.skillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;

      try {
        const rawContent = fs.readFileSync(skillFile, 'utf-8');
        const skill = this.parseSkillFile(rawContent);
        if (skill) skills.push(skill);
      } catch {
        console.warn(`[SkillLoader] Skipped malformed skill in: ${entry.name}`);
      }
    }

    return skills;
  }

  private parseSkillFile(raw: string): Skill | null {
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!frontmatterMatch) return null;

    const [, frontmatterStr, bodyContent] = frontmatterMatch;

    let meta: Record<string, unknown>;
    try {
      meta = yaml.load(frontmatterStr) as Record<string, unknown>;
    } catch {
      return null;
    }

    const name = meta['name'] as string | undefined;
    const description = meta['description'] as string | undefined;
    if (!name || !description) return null;

    return { name, description, content: bodyContent.trim() };
  }
}
```

---

### `src/skills/SkillRouter.ts`

```typescript
import { ILLMProvider } from '../providers/ILLMProvider';
import { SkillMeta } from './SkillLoader';

export class SkillRouter {
  constructor(private readonly provider: ILLMProvider) {}

  async route(userMessage: string, availableSkills: SkillMeta[]): Promise<string | null> {
    if (availableSkills.length === 0) return null;

    const skillList = availableSkills.map((s) => `- ${s.name}: ${s.description}`).join('\n');

    const prompt = `You are a routing assistant. Based on the user message, decide which skill to activate.
Available skills:
${skillList}

User message: "${userMessage}"

Respond with ONLY valid JSON in this exact format, with no extra text:
{"skillName": "<skill-name>" or null}

Return null if no skill matches or if this is casual conversation.`;

    try {
      const response = await this.provider.chat([{ role: 'user', content: prompt }]);
      const raw = response.content?.trim() ?? '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as { skillName?: string | null };
      return parsed.skillName ?? null;
    } catch {
      console.warn('[SkillRouter] Failed to parse routing response, defaulting to null');
      return null;
    }
  }
}
```

---

### `src/skills/SkillExecutor.ts`

```typescript
import { Skill } from './SkillLoader';

export interface SkillContext {
  systemPrompt: string;
  skillName: string | null;
}

export class SkillExecutor {
  buildContext(skill: Skill | null): SkillContext {
    if (!skill) {
      return { skillName: null, systemPrompt: this.defaultSystemPrompt() };
    }

    return {
      skillName: skill.name,
      systemPrompt: `${skill.content}\n\n${this.baseInstructions()}`,
    };
  }

  private defaultSystemPrompt(): string {
    return `You are Boro, a personal AI assistant running locally on the user's desktop.
You are helpful, concise, and accurate.
When creating documents or files, use the create_file tool.
If the user asks for a document as a file, mark your response with [ARQUIVO:filename.md] at the very beginning.

${this.baseInstructions()}`;
  }

  private baseInstructions(): string {
    return `IMPORTANT RULES:
- Always respond in the same language the user uses (default: Portuguese BR).
- When creating structured documents (PRD, specs, reports), wrap the full content and save it as a file using create_file tool.
- When a skill instructs you to call a tool, do it — do not skip tool calls by returning the data as text.
- Be direct and objective in your responses.`;
  }
}
```

---

## 8. Handlers — Telegram I/O

### `src/handlers/TelegramOutputHandler.ts`

```typescript
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

      const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts') as typeof import('msedge-tts');
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
```

---

### `src/handlers/TelegramInputHandler.ts`

```typescript
import { Bot, Context } from 'grammy';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { AgentController } from '../core/AgentController';

const execFileAsync = promisify(execFile);

export class TelegramInputHandler {
  private readonly allowedUserIds: Set<string>;
  private readonly tmpDir: string;

  constructor(
    private readonly bot: Bot<Context>,
    private readonly controller: AgentController,
  ) {
    const rawIds = process.env.TELEGRAM_ALLOWED_USER_IDS ?? '';
    this.allowedUserIds = new Set(rawIds.split(',').map((id) => id.trim()).filter(Boolean));
    this.tmpDir = process.env.TMP_DIR ?? './tmp';
    fs.mkdirSync(this.tmpDir, { recursive: true });
  }

  register(): void {
    this.checkDependencies().catch(() => { /* already logged */ });

    this.bot.on('message:text', async (ctx) => {
      if (!this.isAllowed(ctx)) return;
      await ctx.replyWithChatAction('typing');
      const text = ctx.message.text ?? '';
      const requiresAudioReply = this.detectAudioRequest(text);
      await this.controller.handle(ctx, String(ctx.from!.id), text, requiresAudioReply);
    });

    this.bot.on(['message:voice', 'message:audio'], async (ctx) => {
      if (!this.isAllowed(ctx)) return;
      await ctx.replyWithChatAction('record_voice');
      const fileId = ctx.message.voice?.file_id ?? ctx.message.audio?.file_id ?? '';
      try {
        const text = await this.transcribeAudio(ctx, fileId);
        if (!text) { await ctx.reply('Áudio vazio captado. Pode reenviar?'); return; }
        await this.controller.handle(ctx, String(ctx.from!.id), text, true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`⚠️ Falha ao processar o áudio: ${msg}`);
      }
    });

    this.bot.on('message:document', async (ctx) => {
      if (!this.isAllowed(ctx)) return;
      await ctx.replyWithChatAction('typing');

      const doc = ctx.message.document;
      const mime = doc?.mime_type ?? '';
      const fileName = doc?.file_name ?? '';
      const isPdf = mime === 'application/pdf';
      const isMd = fileName.toLowerCase().endsWith('.md');

      if (!isPdf && !isMd) {
        await ctx.reply('⚠️ No momento, só consigo processar texto estruturado (.md), áudio e PDF.');
        return;
      }

      try {
        const text = await this.extractDocument(ctx, doc!.file_id, isPdf);
        const caption = ctx.message.caption ?? '';
        const fullText = caption ? `${caption}\n\n${text}` : text;
        await this.controller.handle(ctx, String(ctx.from!.id), fullText, false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`⚠️ Falha ao processar o documento: ${msg}`);
      }
    });
  }

  private isAllowed(ctx: Context): boolean {
    const userId = String(ctx.from?.id ?? '');
    if (!this.allowedUserIds.has(userId)) {
      console.log(`[InputHandler] Rejected request from unlisted user: ${userId}`);
      return false;
    }
    return true;
  }

  private detectAudioRequest(text: string): boolean {
    return /responda em áudio|fale comigo|resposta em voz|me responde em áudio/i.test(text);
  }

  private async transcribeAudio(ctx: Context, fileId: string): Promise<string> {
    const telegramFile = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${telegramFile.file_path}`;
    const ext = path.extname(telegramFile.file_path ?? '.ogg') || '.ogg';
    const tmpFile = path.join(this.tmpDir, `audio_${Date.now()}${ext}`);

    try {
      await this.downloadFile(fileUrl, tmpFile);
      return await this.runWhisper(tmpFile);
    } finally {
      this.safeDelete(tmpFile);
    }
  }

  private async extractDocument(ctx: Context, fileId: string, isPdf: boolean): Promise<string> {
    const telegramFile = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${telegramFile.file_path}`;
    const ext = isPdf ? '.pdf' : '.md';
    const tmpFile = path.join(this.tmpDir, `doc_${Date.now()}${ext}`);

    try {
      await this.downloadFile(fileUrl, tmpFile);
      if (ext === '.md') return fs.readFileSync(tmpFile, 'utf-8');

      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
      const buffer = fs.readFileSync(tmpFile);
      if (buffer.length > 20 * 1024 * 1024) {
        throw new Error('PDF excede o limite de 20MB suportado para extração local.');
      }
      const data = await pdfParse(buffer);
      return data.text;
    } finally {
      this.safeDelete(tmpFile);
    }
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    const https = require('https') as typeof import('https');
    const http = require('http') as typeof import('http');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Download timeout após 15s')), 15_000);
      const protocol = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(dest);

      protocol.get(url, (res) => {
        res.pipe(file);
        file.on('finish', () => { clearTimeout(timeout); file.close(); resolve(); });
      }).on('error', (err) => { clearTimeout(timeout); this.safeDelete(dest); reject(err); });
    });
  }

  private async runWhisper(audioPath: string): Promise<string> {
    const outputDir = path.dirname(audioPath);
    const basename = path.basename(audioPath, path.extname(audioPath));
    const outputTxt = path.join(outputDir, `${basename}.txt`);

    try {
      await execFileAsync(
        'whisper',
        [audioPath, '--model', 'base', '--output_format', 'txt', '--output_dir', outputDir],
        { timeout: 60_000 },
      );
      if (!fs.existsSync(outputTxt)) throw new Error('Whisper não gerou arquivo de transcrição');
      const text = fs.readFileSync(outputTxt, 'utf-8').trim();
      console.log(`[InputHandler] Transcript: ${text}`);
      return text;
    } catch (err) {
      throw new Error(
        `⚠️ Não consegui inicializar o Whisper local agora. Verifique se o Whisper está instalado. (${err instanceof Error ? err.message : err})`,
      );
    } finally {
      this.safeDelete(outputTxt);
    }
  }

  private async checkDependencies(): Promise<void> {
    const check = async (bin: string): Promise<boolean> => {
      try { await execFileAsync('which', [bin], { timeout: 5_000 }); return true; }
      catch { return false; }
    };

    const [whisperOk, ffmpegOk] = await Promise.all([check('whisper'), check('ffmpeg')]);
    if (!whisperOk) console.warn('[InputHandler] ⚠️  "whisper" not found. Install: pip install openai-whisper');
    if (!ffmpegOk) console.warn('[InputHandler] ⚠️  "ffmpeg" not found. Install: brew install ffmpeg');
    if (whisperOk && ffmpegOk) console.log('[InputHandler] Dependencies OK: whisper, ffmpeg');
  }

  private safeDelete(filePath: string): void {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
}
```

---

## 9. Entry Point

### `src/index.ts`

```typescript
import 'dotenv/config';
import { Bot } from 'grammy';
import { DatabaseSingleton } from './memory/Database';
import { MemoryManager } from './memory/MemoryManager';
import { ProviderFactory } from './providers/ProviderFactory';
import { ToolRegistry } from './core/ToolRegistry';
import { CreateFileTool } from './tools/CreateFileTool';
import { AgentLoop } from './core/AgentLoop';
import { SkillLoader } from './skills/SkillLoader';
import { SkillRouter } from './skills/SkillRouter';
import { AgentController } from './core/AgentController';
import { TelegramInputHandler } from './handlers/TelegramInputHandler';
import { TelegramOutputHandler } from './handlers/TelegramOutputHandler';

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('FATAL: TELEGRAM_BOT_TOKEN is not set. Check your .env file.');
    process.exit(1);
  }

  console.log('[Boro] Starting...');

  // Persistence
  const db = DatabaseSingleton.getInstance();
  const memoryManager = new MemoryManager(db);

  // LLM Provider
  const provider = ProviderFactory.create();
  const routerProvider = ProviderFactory.createRouter();

  // Tools
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new CreateFileTool());
  // Adicione suas tools aqui: toolRegistry.register(new ProcessVacancyTool());

  // Agent Loop
  const agentLoop = new AgentLoop(provider, toolRegistry);

  // Skill System
  const skillLoader = new SkillLoader();
  const skillRouter = new SkillRouter(routerProvider);

  // Output handler
  const outputHandler = new TelegramOutputHandler();

  // Controller (Facade)
  const controller = new AgentController(
    memoryManager,
    agentLoop,
    skillLoader,
    skillRouter,
    outputHandler,
  );

  // Telegram Bot
  const bot = new Bot(token);
  const inputHandler = new TelegramInputHandler(bot, controller);
  inputHandler.register();

  bot.catch((err) => {
    console.error('[Bot] Unhandled error:', err.message);
  });

  console.log('[Boro] Bot is running. Waiting for messages...');
  await bot.start();
}

main().catch((err) => {
  console.error('[Boro] Fatal startup error:', err);
  process.exit(1);
});
```

---

## 10. Skill de Assistente Geral (mínima para testar)

### `.agents/skills/general-assistant/SKILL.md`

```markdown
---
name: general-assistant
description: Assistente pessoal de uso geral para tarefas cotidianas, perguntas e conversas.
---

# Assistente Geral

Você é o Boro, assistente pessoal do usuário. Responda de forma direta, útil e concisa.

- Responda no idioma do usuário (padrão: Português BR)
- Para documentos estruturados, use a ferramenta `create_file`
- Seja objetivo: não enrole, vá direto ao ponto
```

---

## 11. Ordem de Criação dos Arquivos

Crie nesta sequência para evitar erros de importação circular:

```
1.  src/providers/ILLMProvider.ts
2.  src/providers/GeminiProvider.ts
3.  src/providers/DeepSeekProvider.ts
4.  src/providers/OllamaProvider.ts
5.  src/providers/ProviderFactory.ts
6.  src/memory/Database.ts
7.  src/memory/ConversationRepository.ts
8.  src/memory/MessageRepository.ts
9.  src/memory/MemoryManager.ts
10. src/tools/BaseTool.ts
11. src/tools/CreateFileTool.ts
12. src/core/ToolRegistry.ts
13. src/core/AgentLoop.ts
14. src/skills/SkillLoader.ts
15. src/skills/SkillRouter.ts
16. src/skills/SkillExecutor.ts
17. src/handlers/TelegramOutputHandler.ts
18. src/handlers/TelegramInputHandler.ts
19. src/core/AgentController.ts
20. src/index.ts
21. .agents/skills/general-assistant/SKILL.md
```
