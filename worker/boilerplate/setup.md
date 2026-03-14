# Spec: Setup do Projeto

**Versão:** 1.0
**Status:** Referência
**Autor:** Boro Agent
**Data:** 2026-03-13

---

## 1. Resumo

Tudo necessário para subir o projeto do zero: estrutura de pastas, `package.json`, `tsconfig.json`, `nodemon.json`, `.env.example` e scripts. Copie cada seção literalmente para os arquivos correspondentes.

---

## 2. Pré-requisitos do Sistema

| Requisito | Versão mínima | Como verificar | Como instalar |
|---|---|---|---|
| Node.js | v23.x | `node --version` | `brew install node` ou https://nodejs.org |
| npm | v10.x | `npm --version` | Vem com Node |
| Git | Qualquer | `git --version` | `brew install git` |
| Whisper CLI | Qualquer | `whisper --version` | `pip install openai-whisper` (opcional, para STT) |

**Node path no macOS (homebrew):** `/opt/homebrew/bin/node`

---

## 3. Estrutura de Pastas Completa

```
projeto/
├── .agents/
│   └── skills/
│       ├── tech-recruiter-skill/
│       │   └── SKILL.md
│       ├── general-assistant/
│       │   └── SKILL.md
│       └── (outras skills...)
├── src/
│   ├── core/
│   │   ├── AgentController.ts
│   │   ├── AgentLoop.ts
│   │   └── ToolRegistry.ts
│   ├── handlers/
│   │   ├── TelegramInputHandler.ts
│   │   └── TelegramOutputHandler.ts
│   ├── lib/                          ← NOVO (boilerplate)
│   │   ├── structured-llm/
│   │   │   ├── IStructuredLLMClient.ts
│   │   │   ├── AnthropicStructuredClient.ts
│   │   │   └── GenericStructuredClient.ts
│   │   ├── supervisor/
│   │   │   ├── ISupervisor.ts
│   │   │   ├── SupervisorAgent.ts
│   │   │   └── WorkflowDecision.ts
│   │   ├── workflow/
│   │   │   ├── WorkflowState.ts
│   │   │   └── MultiAgentWorkflow.ts
│   │   └── deterministic/
│   │       ├── index.ts
│   │       └── __tests__/
│   │           └── index.test.ts
│   ├── memory/
│   │   ├── Database.ts
│   │   ├── MemoryManager.ts
│   │   ├── ConversationRepository.ts
│   │   └── MessageRepository.ts
│   ├── providers/
│   │   ├── ILLMProvider.ts
│   │   ├── GeminiProvider.ts
│   │   ├── DeepSeekProvider.ts
│   │   ├── OllamaProvider.ts
│   │   └── ProviderFactory.ts
│   ├── skills/
│   │   ├── SkillLoader.ts
│   │   ├── SkillRouter.ts
│   │   └── SkillExecutor.ts
│   ├── skills-impl/                  ← NOVO (implementações concretas)
│   │   └── tech-recruiter/
│   │       ├── schema.ts
│   │       ├── extractor.ts
│   │       ├── supervisor.ts
│   │       ├── publisher.ts
│   │       ├── workflow.ts
│   │       └── prompts.ts
│   ├── tools/
│   │   ├── BaseTool.ts
│   │   ├── CreateFileTool.ts
│   │   ├── CreateGitHubIssueTool.ts
│   │   └── ProcessVacancyTool.ts     ← NOVO
│   └── index.ts
├── data/                             ← gitignored
├── tmp/                              ← gitignored
├── dist/                             ← gitignored
├── .env                              ← gitignored
├── .env.example                      ← commitado
├── .gitignore
├── nodemon.json
├── package.json
└── tsconfig.json
```

---

## 4. `package.json`

```json
{
  "name": "boro",
  "version": "1.0.0",
  "description": "Agente pessoal de IA controlado via Telegram",
  "main": "dist/index.js",
  "scripts": {
    "dev": "nodemon",
    "build": "tsc",
    "start": "node dist/index.js",
    "type-check": "tsc --noEmit",
    "test": "node --experimental-vm-modules node_modules/.bin/jest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.78.0",
    "@google/generative-ai": "^0.21.0",
    "better-sqlite3": "^11.0.0",
    "dotenv": "^16.4.5",
    "grammy": "^1.31.0",
    "js-yaml": "^4.1.0",
    "msedge-tts": "^1.3.4",
    "openai": "^4.55.0",
    "pdf-parse": "^1.1.1",
    "uuid": "^9.0.0",
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.17.0",
    "@types/pdf-parse": "^1.1.4",
    "@types/uuid": "^9.0.8",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "nodemon": "^3.1.4",
    "ts-node": "^10.9.2",
    "typescript": "^5.9.3"
  }
}
```

**Instalar dependências novas:**
```bash
/opt/homebrew/bin/node /opt/homebrew/lib/node_modules/npm/bin/npm-cli.js install \
  @anthropic-ai/sdk \
  zod-to-json-schema
```

---

## 5. `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## 6. `nodemon.json`

```json
{
  "watch": ["src", ".agents"],
  "ext": "ts,json,md",
  "ignore": ["src/**/*.test.ts", "dist"],
  "exec": "ts-node --project tsconfig.json src/index.ts"
}
```

**Importante:** `.agents` está no watch para hot-reload de skills.

---

## 7. `.env.example` (completo)

```bash
# ─── Telegram ────────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=your_bot_token_here
# IDs separados por vírgula. Obter via @userinfobot no Telegram
TELEGRAM_ALLOWED_USER_IDS=123456789

# ─── LLM Provider Principal (para conversação geral) ─────────────────────────
# Opções: "gemini" | "deepseek" | "ollama"
LLM_PROVIDER=gemini

GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash

DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-chat

# Para Ollama: prefixar LLM_MODEL_NAME com "ollama/"
# LLM_MODEL_NAME=ollama/qwen2.5:7b-instruct
# OLLAMA_BASE_URL=http://localhost:11434/v1

# ─── Anthropic (para pipeline multi-agente de skills estruturadas) ────────────
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Modelos para o pipeline tech-recruiter
# Extrator: modelo mais rápido (barato)
EXTRACTOR_MODEL=claude-haiku-4-5-20251001
# Supervisor: modelo mais capaz (qualidade de validação)
SUPERVISOR_MODEL=claude-sonnet-4-6

# ─── GitHub ──────────────────────────────────────────────────────────────────
# PAT com escopo "repo" em https://github.com/settings/tokens
GITHUB_TOKEN=your_github_pat_here
GITHUB_OWNER=your_github_username_or_org
GITHUB_REPO=your_repository_name

# ─── Comportamento do Agente ─────────────────────────────────────────────────
# Máximo de iterações do AgentLoop (ReAct)
MAX_ITERATIONS=5
# Máximo de retries no pipeline multi-agente (Extrator → Supervisor)
MAX_RETRIES=3
# Janela de histórico de mensagens enviada ao LLM
MEMORY_WINDOW_SIZE=20

# ─── Caminhos ────────────────────────────────────────────────────────────────
DB_PATH=./data/boro.db
TMP_DIR=./tmp
SKILLS_DIR=./.agents/skills
```

---

## 8. `.gitignore`

```gitignore
# Build
dist/
*.js.map

# Dependências
node_modules/

# Dados locais (nunca commitar)
data/
tmp/
*.db
*.db-journal
*.db-wal
*.db-shm

# Variáveis de ambiente (nunca commitar)
.env

# Sistema
.DS_Store
*.log
```

---

## 9. `jest.config.js` (para testes das funções determinísticas)

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }]
  }
};
```

---

## 10. Sequência de Setup do Zero

```bash
# 1. Clone ou crie o projeto
git init boro && cd boro

# 2. Copie package.json, tsconfig.json, nodemon.json, .gitignore deste documento

# 3. Instale dependências
/opt/homebrew/bin/node /opt/homebrew/lib/node_modules/npm/bin/npm-cli.js install

# 4. Crie estrutura de pastas
mkdir -p src/{core,handlers,lib/{structured-llm,supervisor,workflow,deterministic/__tests__},memory,providers,skills,skills-impl/tech-recruiter,tools}
mkdir -p .agents/skills/tech-recruiter-skill
mkdir -p data tmp

# 5. Configure variáveis de ambiente
cp .env.example .env
# Edite .env com seus valores reais

# 6. Implemente os arquivos (ver PROMPT.md para ordem)

# 7. Compile e teste
/opt/homebrew/bin/node /opt/homebrew/lib/node_modules/npm/bin/npm-cli.js run build
/opt/homebrew/bin/node /opt/homebrew/lib/node_modules/npm/bin/npm-cli.js test

# 8. Rode em desenvolvimento
/opt/homebrew/bin/node /opt/homebrew/lib/node_modules/npm/bin/npm-cli.js run dev
```

---

## 11. Verificação de Saúde Pós-Setup

Cheklist antes de testar com o Telegram:

```
□ `npm run build` compila sem erros TypeScript
□ `npm test` passa (testes das funções determinísticas)
□ .env tem TELEGRAM_BOT_TOKEN configurado
□ .env tem ANTHROPIC_API_KEY configurado
□ .env tem GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO configurados
□ Pasta data/ existe (criada pelo setup, não pelo git)
□ Pasta .agents/skills/tech-recruiter-skill/SKILL.md existe
□ ProcessVacancyTool está registrada em src/index.ts
```
