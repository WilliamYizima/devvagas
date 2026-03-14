# Spec: Structured Output com Zod

**Versão:** 1.0
**Status:** Referência
**Autor:** Boro Agent
**Data:** 2026-03-13

---

## 1. Resumo

Structured Output é o padrão de forçar o LLM a retornar dados no formato exato de um schema tipado, validado em runtime por Zod. Em vez de pedir ao modelo que "siga o formato JSON descrito no prompt", o schema é passado diretamente à API, que garante conformidade estrutural na resposta. Isso elimina a categoria inteira de erros onde o modelo retorna campos ausentes, tipos errados ou valores fora do enum.

---

## 2. Contexto e Motivação

**Problema:**
Instruções de prompt como "retorne um JSON com os campos X, Y, Z" são interpretadas, não enforced. O modelo pode retornar `nivel: "Pleno/Sênior"` mesmo quando o prompt proíbe valores combinados. Não há erro em runtime — o dado inválido chega à ferramenta silenciosamente.

**Evidências:**
No projeto antigo, a troca de instrução de prompt para `zodOutputFormat(schema)` com a API Anthropic zerou os erros de tipo nos campos enum (`nivel`, `area`, `tipo`, `linkedin`, `internacional`). Antes disso, ~20% dos outputs tinham campos fora do enum.

**Por que agora:**
O boilerplate precisa de um padrão reproduzível que qualquer skill possa usar para garantir que o LLM nunca retorne dados malformados, independentemente do provider.

---

## 3. Goals (Objetivos)

- [ ] G-01: Definir a interface `IStructuredLLMClient` que qualquer provider deve implementar para suportar structured output com Zod.
- [ ] G-02: Implementar `AnthropicStructuredClient` usando o recurso nativo `output_config.format` da API Anthropic.
- [ ] G-03: Implementar `GenericStructuredClient` (fallback) que injeta o schema como JSON Schema no prompt para providers sem suporte nativo (Gemini, DeepSeek, Ollama).

---

## 4. Non-Goals (Fora do Escopo)

- NG-01: Não substitui o `ILLMProvider` existente do Boro para conversação geral. É um cliente especializado exclusivo para LLM calls que precisam de output estruturado.
- NG-02: Não valida semântica do conteúdo (ex: "o salário faz sentido?"). Apenas garante estrutura e tipos.

---

## 5. Interface Pública

```typescript
// src/lib/structured-llm/IStructuredLLMClient.ts

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
```

---

## 6. Implementações

### 6.1 AnthropicStructuredClient (provider recomendado)

```typescript
// src/lib/structured-llm/AnthropicStructuredClient.ts

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: userMessages,
      // ← API Anthropic força o schema nativo aqui
      output_config: {
        format: {
          type: "json_schema",
          json_schema: {
            name: "output",
            schema: zodToJsonSchema(schema)
          }
        }
      }
    });

    const text = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    const parsed = JSON.parse(text);
    return schema.parse(parsed); // Zod valida em runtime
  }
}
```

### 6.2 GenericStructuredClient (fallback para Gemini/DeepSeek/Ollama)

```typescript
// src/lib/structured-llm/GenericStructuredClient.ts

import { ILLMProvider } from "../../providers/ILLMProvider";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export class GenericStructuredClient implements IStructuredLLMClient {
  constructor(private provider: ILLMProvider) {}

  async generateStructuredOutput<T extends z.ZodType>(
    messages: ChatMessage[],
    schema: T,
    options: StructuredLLMOptions = {}
  ): Promise<z.infer<T>> {
    // Injeta o schema no system prompt como JSON Schema
    const jsonSchema = JSON.stringify(zodToJsonSchema(schema), null, 2);
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
      augmentedMessages.map(m => ({ role: m.role as any, content: m.content }))
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
```

---

## 7. Como Usar em uma Skill

```typescript
// Exemplo em src/skills/tech-recruiter/extractor.ts

import { VacancyFormSchema } from "./schema";
import { AnthropicStructuredClient } from "../../lib/structured-llm/AnthropicStructuredClient";

const client = new AnthropicStructuredClient(process.env.ANTHROPIC_API_KEY!);

export async function extractVacancy(inputText: string): Promise<VacancyForm> {
  const form = await client.generateStructuredOutput(
    [
      { role: "system", content: TECH_RECRUITER_SYSTEM_PROMPT },
      { role: "user", content: inputText }
    ],
    VacancyFormSchema
  );
  // form está 100% conforme o schema Zod — ou Zod.parse lançou erro
  return form;
}
```

---

## 8. Definindo um Schema para uma Nova Skill

### 8.1 Regras para definição de schemas

| Regra | Motivo |
|---|---|
| Campos obrigatórios nunca `optional()` sem default | Força o LLM a sempre preencher |
| Enums explícitos em vez de `z.string()` | LLM não pode inventar valores |
| Usar `z.string().min(1)` em campos de texto obrigatório | Impede strings vazias |
| Adicionar `.describe()` em cada campo | A descrição vai para o JSON Schema que o LLM recebe |

### 8.2 Template de schema

```typescript
// src/skills/<nome>/schema.ts

import { z } from "zod";

export const OutputSchema = z.object({
  // Campo de texto obrigatório
  titulo: z.string().min(1).describe("Título limpo sem emojis ou prefixos"),

  // Campo enum — LLM é forçado a usar um desses valores
  nivel: z.enum(["Júnior", "Pleno", "Sênior", "Lead", "Indefinido"])
           .describe("Nível de senioridade da posição"),

  // Campo opcional com valor padrão semântico
  salario: z.string().optional().describe("Faixa salarial ou 'A combinar'"),
});

export type Output = z.infer<typeof OutputSchema>;

// ValidationResult é universal — usar sempre este formato
export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  feedback: z.string().min(1),
  correctedForm: OutputSchema.optional()
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;
```

---

## 9. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | `generateStructuredOutput` deve lançar erro se Zod.parse falhar | Must | Nunca retornar dado que viola o schema, mesmo que o LLM insista |
| RF-02 | `AnthropicStructuredClient` deve usar `output_config` nativo | Must | Provider Anthropic deve garantir conformidade no nível da API |
| RF-03 | `GenericStructuredClient` deve implementar `parseResilient` | Must | Modelos locais (Ollama) geram JSON com control chars — deve ser tolerado |
| RF-04 | Schemas devem incluir `.describe()` em todos os campos | Should | JSON Schema enviado ao LLM deve ser auto-documentado |

---

## 10. Edge Cases e Tratamento de Erros

| Cenário | Comportamento esperado |
|---|---|
| LLM retorna JSON com campo fora do enum | `schema.parse()` lança `ZodError` — deve ser capturado pelo caller (retry loop) |
| LLM retorna texto + JSON misturado | `GenericStructuredClient` extrai o JSON via regex antes de parsear |
| Provider não suporta `output_config` | Usar `GenericStructuredClient` com injeção de schema no prompt |
| JSON com `\n` não escapado dentro de string | `parseResilient` reescapa control chars antes de `JSON.parse` |

---

## 11. Dependências

| Dependência | Tipo | Impacto se indisponível |
|---|---|---|
| `zod` | Obrigatória | Sem validação de schema em runtime |
| `@anthropic-ai/sdk` | Obrigatória para AnthropicClient | Fallback para GenericStructuredClient |
| `zod-to-json-schema` | Obrigatória | Sem conversão Zod → JSON Schema para injeção no prompt |

---

## 12. Open Questions

- Avaliar se o Gemini 2.0 já tem suporte nativo a JSON Schema via `response_schema` (equivalente ao `output_config` da Anthropic) para não precisar do GenericStructuredClient.
- Definir se erros de Zod devem ser logados com detalhes (para debugging) ou apenas a mensagem genérica (para o retry loop).
