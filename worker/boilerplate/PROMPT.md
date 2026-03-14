# PROMPT DE IMPLEMENTAÇÃO

> **Como usar este arquivo:** Copie o prompt da seção 2 e cole diretamente em uma conversa nova com Claude Code apontando para a raiz do projeto. O agente usará os documentos da pasta `boilerplate/` como fonte da verdade e implementará tudo na ordem correta.

---

## 1. Pré-condição

Antes de passar o prompt ao agente, certifique-se de que:

1. A pasta `boilerplate/` existe com os seguintes arquivos:
   - `README.md`
   - `boro-core.md`             ← infraestrutura base (novo)
   - `architecture.md`
   - `structured-output.md`
   - `supervisor-agent.md`
   - `retry-feedback-loop.md`
   - `deterministic-extraction.md`
   - `schema.md`
   - `prompts.md`
   - `integration.md`
   - `setup.md`
   - `PROMPT.md` (este arquivo)

2. **Projeto zerado:** Apenas a pasta `boilerplate/` existe. Nenhum código pré-existente necessário — `boro-core.md` contém toda a infraestrutura base.

3. O `.env` foi criado a partir do `.env.example` de `boilerplate/setup.md` e preenchido com valores reais.

---

## 2. O Prompt (copie tudo entre as linhas `---`)

---

Leia completamente todos os arquivos dentro da pasta `boilerplate/` antes de escrever qualquer código. Eles são a fonte da verdade para tudo que você vai implementar.

Sua tarefa é criar um projeto do zero com base nesses documentos. O projeto não tem nenhum código pré-existente — tudo deve ser implementado.

## Ordem de Implementação

Implemente EXATAMENTE nesta ordem. Não pule etapas, não agrupe etapas. Complete e verifique cada uma antes de avançar.

### Etapa 0 — Infraestrutura base do Boro
- Leia `boilerplate/boro-core.md` e `boilerplate/setup.md`
- Crie `package.json`, `tsconfig.json`, `nodemon.json`, `.gitignore` conforme `setup.md`
- Execute `npm install`
- Crie os 21 arquivos de infraestrutura na ordem exata da seção 11 de `boro-core.md`
- Crie `.agents/skills/general-assistant/SKILL.md` conforme seção 10 de `boro-core.md`
- Execute `npm run type-check` — deve passar sem erros antes de continuar

### Etapa 1 — Setup das dependências do pipeline
- Leia `boilerplate/setup.md`
- Adicione `@anthropic-ai/sdk` e `zod-to-json-schema` ao `package.json` se ainda não estiverem
- Execute `npm install`
- Crie a estrutura de pastas: `src/lib/structured-llm/`, `src/lib/supervisor/`, `src/lib/workflow/`, `src/lib/deterministic/`, `src/skills-impl/tech-recruiter/`
- Verifique que `npm run type-check` não retorna erros antes de continuar

### Etapa 2 — Funções determinísticas (sem LLM, testáveis imediatamente)
- Leia `boilerplate/deterministic-extraction.md`
- Crie `src/lib/deterministic/index.ts` com todas as funções: `extractFirstLine`, `cleanJobTitle`, `extractPrimaryContact`, `detectInternational`, `detectLinkedIn`, `normalizeNewlines`
- Crie `src/lib/deterministic/__tests__/index.test.ts` com os testes unitários
- Execute `npm test` — todos os testes devem passar antes de continuar

### Etapa 3 — Structured Output Client
- Leia `boilerplate/structured-output.md`
- Crie `src/lib/structured-llm/IStructuredLLMClient.ts` (interface)
- Crie `src/lib/structured-llm/AnthropicStructuredClient.ts`
- Crie `src/lib/structured-llm/GenericStructuredClient.ts`
- Verifique que `npm run type-check` não retorna erros

### Etapa 4 — Supervisor Agent
- Leia `boilerplate/supervisor-agent.md`
- Crie `src/lib/supervisor/ISupervisor.ts` (interface + tipos `ValidationResult`, `SupervisorRule`)
- Crie `src/lib/supervisor/SupervisorAgent.ts`
- Crie `src/lib/supervisor/WorkflowDecision.ts` (função `decideSupervisorAction`)
- Verifique que `npm run type-check` não retorna erros

### Etapa 5 — Workflow Orquestrador
- Leia `boilerplate/retry-feedback-loop.md`
- Crie `src/lib/workflow/WorkflowState.ts`
- Crie `src/lib/workflow/MultiAgentWorkflow.ts`
- Verifique que `npm run type-check` não retorna erros

### Etapa 6 — Schema da Skill Tech Recruiter
- Leia `boilerplate/schema.md`
- Crie `src/skills-impl/tech-recruiter/schema.ts` com `VacancyFormSchema`, `VacancyForm`, `ValidationResultSchema`, `buildIssueBody`, `buildIssueLabels`
- Verifique que `npm run type-check` não retorna erros

### Etapa 7 — Prompts da Skill
- Leia `boilerplate/prompts.md`
- Crie `src/skills-impl/tech-recruiter/prompts.ts` com `TECH_RECRUITER_SYSTEM_PROMPT` e `SUPERVISOR_SYSTEM_PROMPT`

### Etapa 8 — Implementação da Skill (extractor, supervisor, publisher, workflow)
- Leia `boilerplate/integration.md` (seções 3.2 e 3.3) e `boilerplate/prompts.md` (seção 4)
- Crie `src/skills-impl/tech-recruiter/extractor.ts` — usa `AnthropicStructuredClient` + pós-processamento determinístico
- Crie `src/skills-impl/tech-recruiter/supervisor.ts` — exporta `VACANCY_SUPERVISOR_RULES`
- Crie `src/skills-impl/tech-recruiter/publisher.ts` — faz o POST para GitHub REST API
- Crie `src/skills-impl/tech-recruiter/workflow.ts` — factory que instancia `MultiAgentWorkflow`
- Verifique que `npm run type-check` não retorna erros

### Etapa 9 — Tool de Integração com o AgentLoop
- Leia `boilerplate/integration.md` (seção 3.1)
- Crie `src/tools/ProcessVacancyTool.ts`
- Registre a tool em `src/index.ts` junto com as tools existentes
- Verifique que `npm run type-check` não retorna erros

### Etapa 10 — SKILL.md
- Leia `boilerplate/integration.md` (seção 5)
- Substitua o conteúdo de `.agents/skills/tech-recruiter-skill/SKILL.md` com o novo conteúdo definido no documento

### Etapa 11 — Build e verificação final
- Execute `npm run build` — deve compilar sem erros
- Execute `npm test` — todos os testes devem passar
- Verifique o checklist de `boilerplate/setup.md` seção 11

## Regras para o Agente

1. **Nunca pule etapas.** A ordem importa — cada etapa cria dependências para a próxima.
2. **Nunca invente código.** Todo código está documentado nos arquivos `boilerplate/`. Se algo não está documentado, implemente o mínimo necessário e sinalize.
3. **Verifique type-check após cada etapa.** Não avance com erros TypeScript pendentes.
4. **Não modifique arquivos existentes do Boro** (AgentLoop, MemoryManager, providers) a não ser que `integration.md` instrua explicitamente.
5. **Se encontrar ambiguidade**, consulte o arquivo de referência correspondente antes de tomar decisões.
6. **Reporte ao usuário** ao final de cada etapa: o que foi criado e se o type-check passou.

---

## 3. Após a Implementação: Teste de Validação

Quando o agente terminar, envie esta mensagem para o bot no Telegram para validar o funcionamento:

```
Desenvolvedor Node.js Sênior
Empresa: TechCorp Brasil
100% Remoto
Stack: Node.js, TypeScript, PostgreSQL, Redis, Docker

Principais atividades:
- Desenvolver APIs REST escaláveis
- Manter microsserviços em produção
- Code review e mentoria de juniores

Requisitos:
- 5+ anos de experiência com Node.js
- Conhecimento sólido em TypeScript
- Experiência com bancos relacionais
- Inglês técnico para leitura

Benefícios:
- Salário: R$ 12.000 - R$ 18.000 PJ
- Plano de saúde
- 30 dias de férias

Envie CV para: jobs@techcorp.com.br
```

**Resultado esperado:**
```
✅ Vaga publicada com sucesso!
🔗 Issue: https://github.com/seu-usuario/seu-repo/issues/N
📊 Tentativas necessárias: 1
```

**Se der erro:** Verifique `.env` (ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO).

---

## 4. Referência Rápida: Qual Documento Responde o Quê

| Dúvida | Arquivo |
|---|---|
| Como funciona o pipeline no geral? | `README.md` + `architecture.md` |
| Como implementar o Zod schema? | `schema.md` |
| Quais são os system prompts completos? | `prompts.md` |
| Como o AnthropicStructuredClient funciona? | `structured-output.md` |
| Como o SupervisorAgent valida e corrige? | `supervisor-agent.md` |
| Como funciona o loop de retry com feedback? | `retry-feedback-loop.md` |
| Quais campos extrai por código (não LLM)? | `deterministic-extraction.md` |
| Como plugar no Boro (tool, SKILL.md, env)? | `integration.md` |
| Quais dependências instalar? package.json? | `setup.md` |
| Qual prompt passar para o agente implementar? | `PROMPT.md` (este arquivo) |
