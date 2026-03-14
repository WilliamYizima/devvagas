# Boro — Agente de IA no Telegram

Bot pessoal controlado via Telegram com pipeline multi-agente para processamento de vagas de emprego.

## Pré-requisitos

- Node.js 20+
- Um bot do Telegram (criado via [@BotFather](https://t.me/BotFather))
- Chave de API Anthropic (para o pipeline de vagas)
- Chave de API Gemini, DeepSeek ou Ollama (para conversação geral)
- GitHub PAT com escopo `repo` (para publicar issues de vagas)

## Início Rápido

### 1. Configuração inicial

```bash
make setup
```

Isso instala as dependências e cria o arquivo `.env` a partir do `.env.example`.

### 2. Preencha o `.env`

Edite o arquivo `.env` com seus valores reais:

```bash
# Obrigatório
TELEGRAM_BOT_TOKEN=        # Token do @BotFather
TELEGRAM_ALLOWED_USER_IDS= # Seu ID do Telegram (via @userinfobot)
LLM_PROVIDER=gemini        # gemini | deepseek | ollama
GEMINI_API_KEY=            # ou DEEPSEEK_API_KEY / OLLAMA_BASE_URL

# Para a skill de vagas
ANTHROPIC_API_KEY=
GITHUB_TOKEN=              # PAT com escopo "repo"
GITHUB_OWNER=              # seu usuário ou organização no GitHub
GITHUB_REPO=               # repositório onde as vagas serão publicadas
```

### 3. Inicie o bot

```bash
make dev    # desenvolvimento (hot-reload)
# ou
make start  # produção (compila e executa)
```

## Comandos

| Comando          | Descrição                                   |
|------------------|---------------------------------------------|
| `make setup`     | Configuração inicial (instala + cria .env)  |
| `make dev`       | Inicia com hot-reload                       |
| `make start`     | Compila e inicia                            |
| `make build`     | Compila TypeScript                          |
| `make test`      | Executa os testes                           |
| `make type-check`| Verifica tipos sem compilar                 |
| `make clean`     | Remove dist/, data/, tmp/                   |

## Skill: Tech Recruiter

Envie um texto de vaga para o bot — ele extrai os dados, valida com um agente supervisor e publica automaticamente como issue no GitHub.

**Exemplo de uso no Telegram:**
```
Desenvolvedor Node.js Sênior
Empresa: TechCorp
100% Remoto
Stack: Node.js, TypeScript, PostgreSQL
Requisitos: 5+ anos de experiência
Envie CV para: jobs@techcorp.com
```

**Resposta esperada:**
```
✅ Vaga publicada com sucesso!
🔗 Issue: https://github.com/seu-usuario/seu-repo/issues/1
📊 Tentativas necessárias: 1
```

## Estrutura

```
src/
├── core/           # AgentLoop (ReAct), ToolRegistry, AgentController
├── handlers/       # Input/Output para Telegram
├── memory/         # SQLite (conversas e mensagens)
├── providers/      # Adapters de LLM (Gemini, DeepSeek, Ollama)
├── skills/         # Sistema de roteamento de skills
├── tools/          # Tools registradas no AgentLoop
├── lib/
│   ├── deterministic/   # Extração por código (sem LLM)
│   ├── structured-llm/  # Clients de output estruturado (Anthropic, genérico)
│   ├── supervisor/      # Agente validador genérico
│   └── workflow/        # Orquestrador com retry + feedback
└── skills-impl/
    └── tech-recruiter/  # Extrator, Supervisor, Publisher, Workflow
.agents/skills/          # SKILL.md de cada skill (descoberta automática)
```
