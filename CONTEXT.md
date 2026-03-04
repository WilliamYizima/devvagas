# DevVagas — Contexto do Projeto

## O que é

Site estático de vagas tech construído com **Astro**, onde as vagas são gerenciadas via **GitHub Issues**. Toda a infraestrutura é gratuita (GitHub Pages + GitHub Actions + GitHub API pública).

**Fluxo de funcionamento:**
1. Alguém abre uma Issue no repositório com a label `vaga`
2. GitHub Actions detecta o evento e dispara um rebuild do Astro
3. O build chama a GitHub API, busca todas as issues com label `vaga`
4. O site estático é gerado e publicado no GitHub Pages (~1-2 min)

## Stack Atual

- **Framework:** Astro 4.6 (output estático)
- **Linguagem:** TypeScript
- **Estilo:** CSS puro com design system de tema IDE/terminal (JetBrains Mono, Orbitron)
- **Dados:** GitHub Issues como banco de dados
- **Deploy:** GitHub Pages via GitHub Actions
- **Auth:** Nenhuma — usa a API pública do GitHub (limite 60 req/h sem token)

## Estrutura de Arquivos

```
src/
├── lib/
│   └── github.ts        # Integração com GitHub API + parsing das issues
├── layouts/
│   └── BaseLayout.astro # Layout base com topbar, activity bar e statusbar (estilo VS Code)
├── pages/
│   ├── index.astro      # Página de busca/filtro (search page central)
│   ├── vagas.astro      # Listagem de vagas (painel duplo estilo IDE)
│   ├── vaga/[id].astro  # Detalhe da vaga (3 colunas estilo editor)
│   ├── ajuda.astro      # Documentação de como usar
│   └── contato.astro    # Formulário de contato (sem backend)
└── styles/
    └── global.css       # Tokens de cor, tipografia, layout global
```

## Activity Bar (barra lateral esquerda)

Ícones de navegação na lateral, estilo VS Code. Tipo da prop `activeSection`:

| Seção     | Rota       | Ícone       | Descrição                    |
|-----------|------------|-------------|------------------------------|
| `filtro`  | `/`        | Funil       | Página de busca e filtros    |
| `vagas`   | `/vagas`   | Linhas      | Listagem de vagas            |
| `ajuda`   | `/ajuda`   | `?` círculo | Documentação de uso          |
| `contato` | `/contato` | Balão chat  | Formulário de contato        |
| —         | GitHub     | Logo GitHub | Link externo (sempre visível, bottom) |

## Como os dados são extraídos das Issues

O arquivo `src/lib/github.ts` parseia o corpo da Issue com regex para extrair campos nomeados via headers markdown (`### NomeDoCampo`).

**Interface ParsedJob:**
```typescript
interface ParsedJob {
  id, title, body, url, createdAt, updatedAt,
  author: { login, avatar, url },
  labels: string[],     // labels da issue (exceto "vaga")
  empresa: string,      // ### Empresa
  nivel: string,        // ### Nível / Senioridade
  tipo: string,         // ### Tipo / Modelo de Trabalho / Regime
  local: string,        // ### Localização / Local / Cidade
  salario: string,      // ### Salário / Remuneração / Faixa Salarial
  stack: string[],      // ### Stack / Tecnologias / Skills (máx 8)
  descricao: string,    // ### Descrição da Vaga (multi-linha)
  aplicar: string,      // ### Como se candidatar / Aplicar / Link
  isRemote: boolean,    // derivado: tipo/local/labels contêm "remot"
  slug: string,         // slug da URL
}
```

## Filtragem (vagas.astro)

- **Busca textual** por nome da vaga ou empresa (debounce 150ms, campo `data-search`)
- **Filtro de stack** colapsável (`// stack`) com tags dinâmicas geradas pelas stacks reais das vagas
- **Filtros via URL params:** `?q=`, `?stack=`, `?nivel=`, `?modo=`, `?extras=` (vindos da index.astro)
- **Lógica:** OR dentro do grupo de stacks, AND entre grupos; union com filtros de URL
- **Implementação:** client-side JavaScript vanilla

## Painel de Estatísticas (vagas.astro — welcome state)

Quando nenhuma vaga está selecionada, o painel direito exibe 3 anéis concêntricos SVG:

| Anel        | Raio | Stroke | Conteúdo                          |
|-------------|------|--------|-----------------------------------|
| Externo     | 136  | 20px   | Top 4 stacks + Outros             |
| Médio       | 108  | 18px   | Internacional vs Nacional         |
| Interno     | 82   | 16px   | Via LinkedIn vs Outros            |

- Arcos com `stroke-linecap="round"` e CSS `drop-shadow` glow
- Legenda em 3 colunas com barras coloridas e percentuais
- Animação fade-in na entrada (`@keyframes wsIn`)

## O que Falta Implementar

### 1. Tags de Stack para Filtragem
**Situação atual:** O campo `stack` já é extraído da issue (array de strings, máx 8), mas os filtros rápidos são hardcoded (front, back, mobile, devops, data) e não são gerados dinamicamente a partir das stacks reais.

**O que falta:**
- Gerar filtros dinâmicos baseados nas stacks mais populares entre as vagas carregadas
- Ou criar um sistema de tags de stack no template da issue com valores padronizados
- Adicionar chips de stack clicáveis na listagem para filtrar diretamente

---

### 2. Campo de Senioridade
**Situação atual:** O campo `nivel` já é extraído da issue e exibido como tag na listagem, mas **não existe filtro dedicado de senioridade** na UI.

**O que falta:**
- Filtro rápido por senioridade: Junior, Pleno, Senior, Lead/Staff
- Padronizar os valores aceitos no template da issue
- Normalizar variações (ex: "Sênior", "sr.", "Senior" → mesmo filtro)

---

### 3. Modelo de Trabalho (Remoto / Presencial / Híbrido)
**Situação atual:** O campo `tipo`/`isRemote` já existe e há um filtro "remoto", mas apenas detecta remoto vs. não-remoto.

**O que falta:**
- Filtro tripartite: Remoto | Presencial | Híbrido
- Normalizar detecção de híbrido (ex: "hibrido", "híbrido", "hybrid" → `hibrido`)
- Exibir ícone/badge de modelo na listagem com visual distinto para cada um

---

### 4. Template de Issue Padronizado
Para que os filtros acima funcionem de forma confiável, é necessário um **GitHub Issue Template** (`.github/ISSUE_TEMPLATE/vaga.yml`) com campos validados (dropdowns para senioridade e modelo de trabalho, checkboxes para stack).

---

### 5. GitHub Actions (não existe no repo)
O workflow de rebuild automático ao criar/fechar issues ainda precisa ser criado em `.github/workflows/`.

---

## Decisões de Design

- **Tema:** IDE / terminal estilo VS Code/Neovim escuro
- **Cores principais:** `#00ff9d` (verde accent), `#00d4ff` (cyan), fundo `#080b0f`
- **Fontes:** JetBrains Mono (corpo), Orbitron (display/logo)
- **Sem frameworks JS:** Astro puro, JavaScript vanilla no cliente
- **Sem backend:** tudo estático, zero custo de servidor

## Configuração Necessária

No arquivo `src/lib/github.ts`, alterar:
```typescript
export const REPO_OWNER = 'SEU-USUARIO';
export const REPO_NAME  = 'SEU-REPO';
```
