// src/lib/github.ts
// ─────────────────────────────────────────────────────────────
// ⚙️  CONFIGURAÇÃO — troque pelo seu repositório
// ─────────────────────────────────────────────────────────────
export const REPO_OWNER = import.meta.env.REPO_OWNER || 'WilliamYizima';
export const REPO_NAME = import.meta.env.REPO_NAME || 'devvagas';
export const VAGA_LABEL = 'vaga';
// ─────────────────────────────────────────────────────────────

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string; html_url: string };
  labels: { name: string; color: string }[];
}

export interface ParsedJob {
  id: number;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  author: { login: string; avatar: string; url: string };
  labels: string[];
  empresa: string;
  nivel: string;
  tipo: string;
  local: string;
  salario: string;
  stack: string[];
  descricao: string;
  aplicar: string;
  isRemote: boolean;
  isLinkedin: boolean;
  isInternacional: boolean;
  slug: string;
}

function field(body: string, ...keys: string[]): string {
  for (const key of keys) {
    const re = new RegExp(`###\\s*${key}\\s*\\n([^\\n#]+)`, 'i');
    const m = body.match(re);
    if (m) return m[1].trim();
  }
  return '';
}

function textareaField(body: string, key: string): string {
  const re = new RegExp(`###\\s*${key}\\s*\\n([\\s\\S]*?)(?=\\n###|$)`, 'i');
  const m = body.match(re);
  return m ? m[1].trim() : '';
}

function toSlug(title: string): string {
  return title.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseIssue(issue: GitHubIssue): ParsedJob {
  const body = issue.body ?? '';
  const tipo = field(body, 'Tipo', 'Modelo de Trabalho', 'Regime');
  const local = field(body, 'Localização', 'Local', 'Cidade');
  const stackRaw = field(body, 'Stack', 'Tecnologias', 'Skills');
  const stack = stackRaw ? stackRaw.split(/[,;/]/).map(s => s.trim()).filter(Boolean).slice(0, 8) : [];
  const isRemote = /remot/i.test(tipo) || /remot/i.test(local) || issue.labels.some(l => /remot/i.test(l.name));
  const isLinkedin = /sim/i.test(field(body, 'Publicada no LinkedIn', 'LinkedIn'));
  const isInternacional = /sim/i.test(field(body, 'Vaga Internacional', 'Internacional'));
  const cleanTitle = issue.title.replace(/^\[VAGA\]\s*/i, '').trim();

  return {
    id: issue.number,
    title: cleanTitle,
    body,
    url: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    author: { login: issue.user.login, avatar: issue.user.avatar_url, url: issue.user.html_url },
    labels: issue.labels.map(l => l.name).filter(n => n !== VAGA_LABEL),
    empresa: field(body, 'Empresa'),
    nivel: field(body, 'Nível', 'Senioridade'),
    tipo,
    local,
    salario: field(body, 'Salário', 'Remuneração', 'Faixa Salarial'),
    stack,
    descricao: textareaField(body, 'Descrição da Vaga'),
    aplicar: field(body, 'Como se candidatar', 'Aplicar', 'Link'),
    isRemote,
    isLinkedin,
    isInternacional,
    slug: toSlug(cleanTitle),
  };
}

export async function fetchJobs(): Promise<ParsedJob[]> {
  const isProd = import.meta.env.PROD;
  const fallback = isProd ? [] : MOCK_JOBS;

  const url =
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues` +
    `?labels=${VAGA_LABEL}&state=open&per_page=100&sort=created&direction=desc`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github.v3+json' } });
    if (!res.ok) return fallback;
    const issues: GitHubIssue[] = await res.json();
    if (!Array.isArray(issues) || issues.length === 0) return fallback;
    return issues.map(parseIssue);
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────
const now = new Date();
const ago = (n: number) => new Date(+now - n * 86400000).toISOString();

export const MOCK_JOBS: ParsedJob[] = [
  {
    id: 1, slug: 'senior-frontend-engineer',
    title: 'Senior Frontend Engineer',
    body: '', url: '#', createdAt: ago(1), updatedAt: ago(1),
    author: { login: 'nubank', avatar: '', url: '#' },
    labels: ['frontend', 'react'],
    empresa: 'Nubank', nivel: 'Sênior', tipo: 'Remoto', local: 'Remoto BR',
    salario: 'R$ 18k–26k',
    stack: ['React', 'TypeScript', 'GraphQL', 'Storybook', 'Jest'],
    descricao: `### Sobre a empresa\nO Nubank é uma das maiores fintechs do mundo, com mais de 100 milhões de clientes na América Latina.\n\n### Responsabilidades\n- Construir e evoluir a design system\n- Colaborar com designers e PMs\n- Code reviews e mentoria\n\n### Requisitos\n- 5+ anos com React\n- TypeScript avançado\n- GraphQL (Apollo)\n\n### Benefícios\n- Stock options\n- Home office 100%\n- R$ 6k/ano em educação`,
    aplicar: 'https://nubank.com.br/carreiras', isRemote: true, isLinkedin: false, isInternacional: false,
  },
  {
    id: 2, slug: 'backend-engineer-nodejs',
    title: 'Backend Engineer — Node.js / AWS',
    body: '', url: '#', createdAt: ago(2), updatedAt: ago(2),
    author: { login: 'ifood', avatar: '', url: '#' },
    labels: ['backend', 'node'],
    empresa: 'iFood', nivel: 'Pleno', tipo: 'Híbrido', local: 'São Paulo/SP',
    salario: 'R$ 12k–18k',
    stack: ['Node.js', 'AWS', 'PostgreSQL', 'Kafka', 'Docker'],
    descricao: `### Sobre a empresa\nA maior plataforma de delivery do Brasil.\n\n### Responsabilidades\n- Desenvolver APIs de alta disponibilidade\n- Integrar com sistemas de pagamento\n- Monitoramento e observabilidade\n\n### Requisitos\n- 3+ anos com Node.js\n- AWS (Lambda, SQS, RDS)\n- Bancos relacionais`,
    aplicar: 'https://carreiras.ifood.com.br', isRemote: false, isLinkedin: true, isInternacional: false,
  },
  {
    id: 3, slug: 'fullstack-developer-nextjs-go',
    title: 'Fullstack Developer — Next.js + Go',
    body: '', url: '#', createdAt: ago(3), updatedAt: ago(3),
    author: { login: 'pagarme', avatar: '', url: '#' },
    labels: ['fullstack', 'remote'],
    empresa: 'Pagar.me', nivel: 'Sênior', tipo: 'Remoto', local: 'Remoto Global',
    salario: 'R$ 16k–22k',
    stack: ['Next.js', 'Go', 'Redis', 'Docker', 'k8s'],
    descricao: `### Sobre a empresa\nInfraestrutura de pagamentos para o futuro.\n\n### Responsabilidades\n- APIs de pagamento em Go\n- Dashboard em Next.js\n- Performance e segurança\n\n### Requisitos\n- Go ou Rust em produção\n- Next.js / React\n- Sistemas distribuídos`,
    aplicar: 'mailto:jobs@pagar.me', isRemote: true, isLinkedin: false, isInternacional: true,
  },
  {
    id: 4, slug: 'mobile-engineer-react-native',
    title: 'Mobile Engineer — React Native',
    body: '', url: '#', createdAt: ago(4), updatedAt: ago(4),
    author: { login: 'mercadolivre', avatar: '', url: '#' },
    labels: ['mobile'],
    empresa: 'Mercado Livre', nivel: 'Pleno', tipo: 'Remoto', local: 'LATAM Remoto',
    salario: 'USD 3k–4.5k',
    stack: ['React Native', 'TypeScript', 'Jest', 'Detox'],
    descricao: `### Sobre a empresa\nO maior marketplace da América Latina.\n\n### Responsabilidades\n- App iOS e Android\n- Performance em dispositivos low-end\n- CI/CD mobile\n\n### Requisitos\n- React Native em produção\n- TypeScript\n- Testes E2E (Detox)`,
    aplicar: 'https://jobs.mercadolivre.com', isRemote: true, isLinkedin: true, isInternacional: true,
  },
  {
    id: 5, slug: 'devops-sre-engineer',
    title: 'DevOps / SRE Engineer',
    body: '', url: '#', createdAt: ago(5), updatedAt: ago(5),
    author: { login: 'stone', avatar: '', url: '#' },
    labels: ['devops', 'infra'],
    empresa: 'Stone', nivel: 'Sênior', tipo: 'Remoto', local: 'RJ / Remoto',
    salario: 'R$ 20k–30k',
    stack: ['Kubernetes', 'Terraform', 'GCP', 'Prometheus', 'Grafana'],
    descricao: `### Sobre a empresa\nPlataforma de pagamentos para o comércio brasileiro.\n\n### Responsabilidades\n- Infraestrutura como código\n- SLOs e incident response\n- Kubernetes multi-cluster\n\n### Requisitos\n- k8s em produção\n- Terraform\n- Observabilidade`,
    aplicar: 'https://stone.com.br/carreiras', isRemote: true, isLinkedin: false, isInternacional: false,
  },
  {
    id: 6, slug: 'data-engineer-python',
    title: 'Data Engineer — Python / Spark',
    body: '', url: '#', createdAt: ago(7), updatedAt: ago(7),
    author: { login: 'loft', avatar: '', url: '#' },
    labels: ['data', 'python'],
    empresa: 'Loft', nivel: 'Júnior', tipo: 'Remoto', local: 'Remoto BR',
    salario: 'R$ 7k–11k',
    stack: ['Python', 'Apache Spark', 'Airflow', 'BigQuery', 'dbt'],
    descricao: `### Sobre a empresa\nO maior marketplace de imóveis do Brasil.\n\n### Responsabilidades\n- Pipelines de dados\n- Data quality\n- Dashboards analíticos\n\n### Requisitos\n- Python\n- SQL avançado\n- Conceitos de data warehouse`,
    aplicar: 'https://loft.com.br/carreiras', isRemote: true, isLinkedin: false, isInternacional: false,
  },
];
