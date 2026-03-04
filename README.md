# ◆ DevVagas v2

Site de vagas tech com estética de IDE — gerenciado via **GitHub Issues**, hospedado no **GitHub Pages**.

## Stack
- **Astro 4** — SSG, View Transitions API
- **GitHub Issues** — banco de dados de vagas
- **GitHub Actions** — CI/CD automático
- **GitHub Pages** — hospedagem gratuita

## Setup

```bash
# 1. Configure o repositório em src/lib/github.ts
export const REPO_OWNER = 'seu-usuario';
export const REPO_NAME  = 'seu-repo';

# 2. Instale e rode
npm install
npm run dev   # http://localhost:4321
```

## Deploy

1. Ative GitHub Pages: `Settings → Pages → Source → GitHub Actions`
2. Faça push para `main` — o Actions cuida do resto

## Páginas

- `/` — busca e filtros (search page central)
- `/vagas` — listagem split-view com painel de estatísticas (anéis de stack/distribuição/origem)
- `/vaga/[id]` — detalhe da vaga (layout IDE terminal)
- `/ajuda` — documentação
- `/contato` — formulário de contato

## Navegação (Activity Bar)

Barra lateral esquerda estilo VS Code com 4 ícones:
- **⌕ Filtro** (`/`) — busca avançada com filtros de stack, nível e modelo
- **≡ Vagas** (`/vagas`) — listagem completa de vagas abertas
- **? Ajuda** (`/ajuda`) — como publicar uma vaga
- **✉ Contato** (`/contato`) — formulário de contato

## Publicando uma vaga

`Issues → New Issue → Publicar Vaga` → preencha o formulário → site atualiza em ~1 min.
