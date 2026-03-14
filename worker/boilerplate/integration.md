# Spec: Integração com o Boro (ai-bot-boilerplate)

**Versão:** 1.0
**Status:** Referência
**Autor:** Boro Agent
**Data:** 2026-03-13

---

## 1. Resumo

Define como conectar o pipeline multi-agente (Extrator → Supervisor → Publisher) com a infraestrutura existente do Boro. O ponto de entrada é uma `Tool` registrada no `ToolRegistry` que encapsula o `MultiAgentWorkflow` completo. O AgentLoop existente chama essa tool quando a skill `tech-recruiter-skill` está ativa.

---

## 2. Visão da Integração

```
Infraestrutura Boro (existente)          Novo código (boilerplate)
─────────────────────────────────────    ──────────────────────────────────────
TelegramInputHandler                     src/lib/structured-llm/
    ↓                                        AnthropicStructuredClient.ts
AgentController                          src/lib/supervisor/
    ↓                                        SupervisorAgent.ts
SkillRouter → "tech-recruiter-skill"     src/lib/workflow/
    ↓                                        MultiAgentWorkflow.ts
SkillExecutor (injeta SKILL.md)          src/lib/deterministic/
    ↓                                        index.ts
AgentLoop ──────────────────────────────► src/tools/ProcessVacancyTool.ts  ←── PONTO DE ENTRADA
    ↓                                        ↓
ToolRegistry.get("process_vacancy")      src/skills/tech-recruiter/
    ↓                                        extractor.ts
ProcessVacancyTool.execute(text)             supervisor.ts
    ↓                                        publisher.ts
GitHub REST API                              workflow.ts
    ↓                                        schema.ts
issueUrl → AgentLoop → Telegram              prompts.ts
```

---

## 3. Arquivo por Arquivo: O que Criar

### 3.1 Tool — `src/tools/ProcessVacancyTool.ts`

Esta é a única peça de integração entre o Boro e o pipeline novo. O AgentLoop a enxerga como qualquer outra tool.

```typescript
import { BaseTool, ToolResult } from "./BaseTool";
import { createVacancyWorkflow } from "../skills/tech-recruiter/workflow";

interface ProcessVacancyArgs {
  text: string;
}

export class ProcessVacancyTool extends BaseTool {
  name = "process_vacancy";
  description =
    "Processa o texto de uma vaga de emprego: extrai dados, valida e cria uma issue no GitHub. " +
    "Use esta ferramenta quando o usuário enviar o texto de uma vaga para ser publicada.";

  parameters = {
    type: "object" as const,
    properties: {
      text: {
        type: "string",
        description: "Texto bruto completo da vaga de emprego, exatamente como recebido."
      }
    },
    required: ["text"]
  };

  async execute({ text }: ProcessVacancyArgs): Promise<ToolResult> {
    const workflow = createVacancyWorkflow();
    const result = await workflow.run(text);

    if (result.success) {
      return {
        output: [
          `✅ Vaga publicada com sucesso!`,
          `🔗 Issue: ${result.url}`,
          `📊 Tentativas necessárias: ${result.retries + 1}`,
        ].join("\n")
      };
    }

    return {
      output: [
        `❌ Não foi possível publicar a vaga após ${result.retries + 1} tentativas.`,
        `Motivo: ${result.error}`,
        `Sugestão: Verifique se o texto contém informações suficientes sobre a vaga.`,
      ].join("\n")
    };
  }
}
```

### 3.2 Workflow Factory — `src/skills/tech-recruiter/workflow.ts`

```typescript
import { MultiAgentWorkflow } from "../../lib/workflow/MultiAgentWorkflow";
import { VacancyFormSchema } from "./schema";
import { extractVacancy } from "./extractor";
import { VACANCY_SUPERVISOR_RULES } from "./supervisor";
import { publishVacancy } from "./publisher";
import { AnthropicStructuredClient } from "../../lib/structured-llm/AnthropicStructuredClient";

export function createVacancyWorkflow() {
  const supervisorClient = new AnthropicStructuredClient(
    process.env.ANTHROPIC_API_KEY!,
    process.env.SUPERVISOR_MODEL ?? "claude-sonnet-4-6"
  );

  return new MultiAgentWorkflow({
    schema: VacancyFormSchema,
    extractor: extractVacancy,
    publisher: publishVacancy,
    supervisorRules: VACANCY_SUPERVISOR_RULES,
    supervisorClient,
    maxRetries: parseInt(process.env.MAX_RETRIES ?? "3")
  });
}
```

### 3.3 Publisher — `src/skills/tech-recruiter/publisher.ts`

```typescript
import { VacancyForm } from "./schema";
import { buildIssueBody, buildIssueLabels } from "./schema";
import { normalizeNewlines } from "../../lib/deterministic";

export async function publishVacancy(form: VacancyForm): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    throw new Error(
      "Variáveis de ambiente GITHUB_TOKEN, GITHUB_OWNER ou GITHUB_REPO não configuradas."
    );
  }

  const title = `[VAGA] ${form.vaga}`;
  const body = normalizeNewlines(buildIssueBody(form));
  const labels = buildIssueLabels(form);

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({ title, body, labels })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${error}`);
  }

  const issue = await response.json() as { html_url: string; number: number };
  console.log(`[Publisher] Issue #${issue.number} criada: ${issue.html_url}`);
  return issue.html_url;
}
```

---

## 4. Registro da Tool em `src/index.ts`

Adicionar ao arquivo de entrada existente do Boro:

```typescript
// src/index.ts — adicionar junto com CreateFileTool e CreateGitHubIssueTool

import { ProcessVacancyTool } from "./tools/ProcessVacancyTool";

// ... (código existente) ...

const toolRegistry = new ToolRegistry();
toolRegistry.register(new CreateFileTool());
toolRegistry.register(new CreateGitHubIssueTool());  // pode remover se ProcessVacancyTool substituir
toolRegistry.register(new ProcessVacancyTool());      // ← adicionar esta linha
```

---

## 5. SKILL.md — `.agents/skills/tech-recruiter-skill/SKILL.md`

Substituir o conteúdo atual pelo novo. O SKILL.md agora é mais simples porque a lógica está no código, não no prompt.

```markdown
---
name: tech-recruiter-skill
description: Processa textos de vagas de emprego e publica como issues no GitHub. Use quando o usuário enviar uma vaga para ser publicada, independentemente do formato (texto copiado, WhatsApp, LinkedIn, email).
---

# Tech Recruiter

Você é um assistente de recrutamento de tecnologia. Quando receber um texto de vaga de emprego, use a ferramenta `process_vacancy` para processar e publicar.

## Quando usar esta skill

- Usuário manda texto bruto de vaga
- Usuário pede para "publicar vaga", "processar vaga", "criar issue de vaga"
- Mensagem contém descrição de cargo, requisitos técnicos, forma de candidatura

## Como usar

1. Identifique o texto da vaga na mensagem do usuário
2. Chame `process_vacancy` passando o texto completo
3. Retorne o link da issue criada ao usuário

## O que NÃO fazer

- Não tente extrair ou formatar a vaga manualmente — a ferramenta faz isso
- Não modifique o texto antes de passar para a ferramenta
- Não crie a issue diretamente com `create_github_issue` — use `process_vacancy`

## Resposta ao usuário

Após a ferramenta retornar, informe:
- ✅ Link da issue criada (se sucesso)
- ❌ Motivo da falha com sugestão (se erro)
```

---

## 6. Variáveis de Ambiente Adicionais

Adicionar ao `.env` e `.env.example`:

```bash
# ─── Tech Recruiter Skill ────────────────────────────────────────────────────

# Anthropic (para o pipeline multi-agente)
# Obrigatório se usar AnthropicStructuredClient (recomendado)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Modelos para cada agente (opcional — têm defaults)
EXTRACTOR_MODEL=claude-haiku-4-5-20251001
SUPERVISOR_MODEL=claude-sonnet-4-6

# GitHub (para publicar as issues)
GITHUB_TOKEN=your_github_pat_here          # PAT com escopo "repo"
GITHUB_OWNER=your_github_username_or_org
GITHUB_REPO=your_repository_name          # ex: devvagas

# Comportamento do workflow
MAX_RETRIES=3                              # máximo de retries por vaga (padrão: 3)
```

---

## 7. Dependências Novas a Instalar

```bash
npm install @anthropic-ai/sdk zod zod-to-json-schema
```

| Pacote | Versão | Para quê |
|---|---|---|
| `@anthropic-ai/sdk` | `^0.78.0` | AnthropicStructuredClient (structured output nativo) |
| `zod` | `^3.23.0` | Já existe no projeto — confirmar versão |
| `zod-to-json-schema` | `^3.23.0` | Converter Zod schema → JSON Schema para GenericStructuredClient |

---

## 8. Fluxo de Teste Manual

Após implementar, testar com:

```
# 1. Inicie o Boro normalmente
npm run dev

# 2. No Telegram, envie uma vaga de teste:
"Desenvolvedor Node.js Sênior
Empresa: TechCorp
Remoto - Brasil
Stack: Node.js, TypeScript, PostgreSQL
Requisitos: 5+ anos Node.js, experiência com APIs REST
Envie CV para jobs@techcorp.com"

# 3. Resposta esperada do bot:
"✅ Vaga publicada com sucesso!
🔗 Issue: https://github.com/seu-usuario/seu-repo/issues/1
📊 Tentativas necessárias: 1"
```

---

## 9. Compatibilidade com `CreateGitHubIssueTool` Existente

A `ProcessVacancyTool` e a `CreateGitHubIssueTool` podem coexistir. A diferença:

| Tool | Quando o AgentLoop usa |
|---|---|
| `create_github_issue` | Outras skills que precisam criar issues genéricas (sem pipeline de validação) |
| `process_vacancy` | Apenas para vagas de emprego — encapsula o workflow completo |

Recomendação: **manter as duas registradas** e deixar o SKILL.md do tech-recruiter instruir explicitamente para usar `process_vacancy`.

---

## 10. Edge Cases de Integração

| Cenário | Comportamento esperado |
|---|---|
| `ANTHROPIC_API_KEY` não configurado | `ProcessVacancyTool.execute` lança erro → AgentLoop retorna mensagem de erro ao usuário |
| `GITHUB_TOKEN` sem permissão `repo` | `publishVacancy` lança erro `GitHub API error 403` → workflow retorna falha com mensagem clara |
| Texto de vaga muito longo (>10k chars) | Anthropic aceita até ~200k tokens — sem problema. Gemini Flash aceita ~1M |
| Usuário manda áudio com a vaga | `TelegramInputHandler` transcreve via Whisper → texto chega ao AgentLoop normalmente → `process_vacancy` é chamada com o texto transcrito |
| Usuário manda PDF com a vaga | `TelegramInputHandler` extrai texto do PDF → fluxo normal |
