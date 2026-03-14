# Boilerplate: Agentes de Alta Assertividade

> Overview rápido para entender o que é cada componente, por que existe, e como tudo se conecta.

---

## Por que este boilerplate existe

O Boro (ai-bot-boilerplate) tem uma skill de Tech Recruiter que funciona, mas não garante qualidade. O projeto antigo (`boro-talent-aquisition-worker`) sempre cria issues corretas porque usa 4 pilares que o Boro não tem.

Este boilerplate documenta esses 4 pilares para que qualquer skill que precise de **output estruturado confiável** possa implementá-los.

---

## Os 4 Pilares (leia na ordem)

```
1. structured-output.md     ← Como forçar o LLM a retornar JSON válido
2. supervisor-agent.md      ← Como validar e corrigir o output com um segundo LLM
3. retry-feedback-loop.md   ← Como conectar tudo em um loop de correção
4. deterministic-extraction.md ← O que o código deve fazer em vez do LLM
```

`architecture.md` é o documento técnico completo que une tudo.

---

## Versões e o que realmente funciona

| Componente | Biblioteca | Versão | Notas |
|---|---|---|---|
| Structured output nativo | `@anthropic-ai/sdk` | `^0.78.0` | `output_config.format` só funciona com Anthropic. Para Gemini/DeepSeek, usa GenericStructuredClient |
| Schema validation | `zod` | `^3.23.0` | Qualquer versão ^3 funciona |
| Zod → JSON Schema | `zod-to-json-schema` | `^3.23.0` | Necessário para GenericStructuredClient |
| Workflow orchestration | Custom (`MultiAgentWorkflow`) | — | Não usa LangGraph. Loop `while` puro com estado imutável |
| LLM para Supervisor | Anthropic `claude-opus-4-6` | — | Modelo mais capaz para validação. Extrator pode usar Flash/Haiku |
| Thinking mode | `betas: ["interleaved-thinking-2025-05-14"]` | API 2025-05 | Melhora raciocínio do Supervisor em casos ambíguos |

---

## Por que usar o Supervisor

Sem Supervisor, um único LLM faz extração e validação. O problema: ele valida o próprio output com **viés de confirmação** — tende a aprovar o que ele mesmo gerou.

```
SEM SUPERVISOR                    COM SUPERVISOR
─────────────────────────         ─────────────────────────────────────
Extrator extrai + "valida"        Extrator extrai
      ↓                                  ↓
  Publica                         Supervisor (contexto limpo) valida
                                         ↓
  Taxa de erro: ~20%              Corrige ou pede retry
                                         ↓
                                  Publica apenas quando aprovado
                                  Taxa de erro: ~1%
```

O Supervisor tem **contexto limpo**: não viu o texto original, só o JSON estruturado. Isso força raciocínio sobre dados, não sobre intenção.

---

## Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                        PIPELINE COMPLETO                        │
└─────────────────────────────────────────────────────────────────┘

 Texto bruto (inputText)
        │
        ▼
┌───────────────────┐
│  CÓDIGO           │  extractFirstLine(inputText)
│  Extração         │  cleanJobTitle(firstLine)
│  Determinística   │  detectLinkedIn(inputText)
└────────┬──────────┘
         │ campos determinísticos prontos
         ▼
┌───────────────────┐
│  LLM CALL #1      │  AnthropicStructuredClient
│  Agente Extrator  │  + Zod schema (output_config.format)
│  [VacancyForm]    │  + feedbackHistory (se retry)
└────────┬──────────┘
         │ VacancyForm (Zod-validated)
         │
         │ ◄── CÓDIGO sobrescreve vaga, linkedin, internacional
         ▼
┌───────────────────┐
│  LLM CALL #2      │  AnthropicStructuredClient (thinking=true)
│  Supervisor       │  Recebe só o JSON, sem texto original
│  [ValidationResult│  Regras de negócio injetadas no prompt
└────────┬──────────┘
         │
    ┌────┴────┐
    │ isValid │
    └────┬────┘
         │
    ┌────▼──────────────────────────────┐
    │ isValid=true        → PUBLICAR    │
    │ correctedForm       → PUBLICAR    │
    │ retry < MAX_RETRIES → EXTRATOR ◄──┤ (com feedback acumulado)
    │ retry >= MAX_RETRIES→ FALHAR      │
    └───────────────────────────────────┘
         │
         ▼
   Ferramenta Publicadora
   (GitHub REST / API / DB)
         │
         ▼
   ✅ URL / ID do recurso criado
```

---

## Mapa de Arquivos do que Implementar

```
src/lib/
├── structured-llm/
│   ├── IStructuredLLMClient.ts     ← Interface comum
│   ├── AnthropicStructuredClient.ts ← Usa output_config (recomendado)
│   └── GenericStructuredClient.ts  ← Fallback para Gemini/DeepSeek
│
├── supervisor/
│   ├── ISupervisor.ts              ← Interface + ValidationResult type
│   ├── SupervisorAgent.ts          ← Implementação genérica
│   └── WorkflowDecision.ts         ← Lógica de roteamento pós-Supervisor
│
├── workflow/
│   ├── WorkflowState.ts            ← Estado imutável do loop
│   └── MultiAgentWorkflow.ts       ← Orquestrador genérico
│
└── deterministic/
    ├── index.ts                    ← Todas as funções determinísticas
    └── __tests__/index.test.ts     ← Testes unitários obrigatórios

src/skills/<nome-da-skill>/
├── schema.ts         ← Zod schemas (Output + ValidationResult)
├── extractor.ts      ← Extrator específico da skill
├── supervisor.ts     ← Regras de negócio para o SupervisorAgent
├── publisher.ts      ← Lógica de publicação
├── workflow.ts       ← Instancia e configura MultiAgentWorkflow
└── prompts.ts        ← System prompts dos agentes
```

---

## Custo de LLM Calls por Item Processado

| Cenário | Calls | Quando ocorre |
|---|---|---|
| Ideal (extração perfeita) | 2 | Extrator + Supervisor aprova |
| Supervisor corrige direto | 2 | Extrator + Supervisor retorna correctedForm |
| 1 retry necessário | 4 | Extrator → Supervisor reprova → Extrator → Supervisor aprova |
| 2 retries | 6 | Raro (~5% dos casos) |
| Falha total (3 retries) | 8 | Muito raro (~1%). Input ambíguo demais |

**Média esperada: ~2.2 calls por item** (a maioria resolve em 2 calls).

---

## O que cada documento cobre

| Arquivo | O que você vai encontrar |
|---|---|
| [boro-core.md](./boro-core.md) | **Código completo copiável** da infra base: providers (Gemini/DeepSeek/Ollama), SQLite, AgentLoop ReAct, SkillSystem, handlers Telegram, `index.ts` — tudo para partir do zero |
| [architecture.md](./architecture.md) | Visão completa do pipeline, decisões de design, padrão de nomenclatura de arquivos, trade-offs |
| [structured-output.md](./structured-output.md) | Interface `IStructuredLLMClient`, `AnthropicStructuredClient`, `GenericStructuredClient`, templates Zod |
| [supervisor-agent.md](./supervisor-agent.md) | `SupervisorAgent<T>`, lógica de `correctedForm`, tabela comparativa Supervisor vs. checklist |
| [retry-feedback-loop.md](./retry-feedback-loop.md) | `MultiAgentWorkflow`, `WorkflowState`, acumulação de feedback, integração com AgentLoop |
| [deterministic-extraction.md](./deterministic-extraction.md) | `extractFirstLine`, `cleanJobTitle`, `extractPrimaryContact`, `detectLinkedIn` + testes unitários |
| [schema.md](./schema.md) | Zod schema completo campo a campo, regras de enum, formato da issue, `buildIssueBody`, `buildIssueLabels` |
| [prompts.md](./prompts.md) | System prompts completos do Extrator e Supervisor, prontos para copiar, modelos recomendados |
| [integration.md](./integration.md) | `ProcessVacancyTool`, `workflow.ts`, `publisher.ts`, registro em `index.ts`, `SKILL.md`, env vars |
| [setup.md](./setup.md) | `package.json`, `tsconfig.json`, `nodemon.json`, `.env.example`, `.gitignore`, sequência de setup |
| [PROMPT.md](./PROMPT.md) | **Prompt pronto para passar ao Claude Code** + 12 etapas ordenadas (inclui Etapa 0: infra base) + teste de validação |

---

## Checklist para criar uma nova skill com este padrão

```
□ Definir schema Zod em schema.ts com .describe() em todos os campos
□ Criar extractor.ts que usa IStructuredLLMClient + pós-processamento determinístico
□ Criar supervisor.ts com regras de negócio específicas da skill
□ Criar publisher.ts que publica apenas dados aprovados
□ Instanciar MultiAgentWorkflow em workflow.ts com maxRetries=3
□ Criar testes unitários para funções determinísticas
□ Adicionar MAX_RETRIES ao .env.example
```
