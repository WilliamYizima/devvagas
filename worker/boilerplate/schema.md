# Spec: Schema de Dados — VacancyForm

**Versão:** 1.0
**Status:** Referência
**Autor:** Boro Agent
**Data:** 2026-03-13

---

## 1. Resumo

Define o contrato de dados completo da skill Tech Recruiter. Todo campo está especificado com tipo, enum válidos, regra de extração, valor padrão quando ausente, e exemplos de input/output. Este documento é a fonte da verdade para o Zod schema, os prompts do Extrator e as regras do Supervisor.

---

## 2. Schema Zod Completo (copie para `src/skills/tech-recruiter/schema.ts`)

```typescript
import { z } from "zod";

// ─── Schema principal ────────────────────────────────────────────────────────

export const VacancyFormSchema = z.object({

  vaga: z
    .string()
    .min(1)
    .describe(
      "Título limpo da vaga. Extraído da primeira linha do texto. " +
      "Sem emojis, sem 'VAGA:', sem localidade, sem nome da empresa, sem nível."
    ),

  empresa: z
    .string()
    .min(1)
    .describe(
      "Nome da empresa contratante. Use 'Empresa indefinida' se não mencionado."
    ),

  nivel: z
    .enum(["Júnior", "Pleno", "Sênior", "Lead", "Especialista", "Indefinido"])
    .describe(
      "Nível de senioridade. NUNCA combine valores (ex: 'Pleno/Sênior' é inválido). " +
      "Se houver ambiguidade entre dois níveis, use o mais alto. " +
      "Use 'Indefinido' apenas se não for possível inferir."
    ),

  area: z
    .enum(["Dev", "Business", "Indefinido"])
    .describe(
      "Área da vaga. 'Dev' para qualquer posição técnica: engenharia, dados, QA, DevOps, design de produto. " +
      "'Business' para: vendas, marketing, financeiro, jurídico, RH, produto (não técnico). " +
      "Use 'Indefinido' somente se genuinamente impossível classificar."
    ),

  tipo: z
    .enum(["Remoto", "Híbrido", "Presencial", "Indefinido"])
    .describe(
      "Modelo de trabalho. Se múltiplos modelos mencionados, use 'Híbrido'. " +
      "Use 'Indefinido' se não mencionado."
    ),

  local: z
    .string()
    .min(1)
    .describe(
      "Localização da vaga. Se remoto sem sede, use 'Remoto'. " +
      "Se presencial, use 'Cidade - Estado'. " +
      "Se híbrido, mencione a cidade do escritório."
    ),

  salario: z
    .string()
    .optional()
    .describe(
      "Faixa salarial ou valor. Copie exatamente como está no texto. " +
      "Se não mencionado, omitir o campo (não usar 'A combinar' — o publisher adiciona)."
    ),

  stack: z
    .string()
    .min(1)
    .describe(
      "Tecnologias, ferramentas e linguagens mencionadas, separadas por vírgula. " +
      "Ex: 'Node.js, TypeScript, PostgreSQL, Docker'. " +
      "Se nenhuma tecnologia mencionada, use 'Indefinido'."
    ),

  descricao: z
    .string()
    .min(1)
    .describe(
      "Descrição estruturada da vaga em markdown. Deve conter exatamente 4 seções com headers '####': " +
      "'#### 🎯 Principais Atividades', " +
      "'#### ✅ Requisitos Técnicos', " +
      "'#### 🌟 Diferenciais' (se mencionado), " +
      "'#### 💰 Benefícios' (se mencionado). " +
      "Mínimo: as duas primeiras seções sempre presentes."
    ),

  aplicar: z
    .string()
    .min(1)
    .describe(
      "Contato PRIMÁRIO para candidatura: URL, email ou telefone. Apenas UM valor. " +
      "Se houver múltiplos, escolher o mais direto (preferência: URL > email > telefone). " +
      "Copiar exatamente, sem modificar."
    ),

  linkVaga: z
    .string()
    .optional()
    .describe(
      "Contatos SECUNDÁRIOS ou link adicional da vaga. Apenas se existir um segundo contato além do 'aplicar'. " +
      "Se não houver, omitir."
    ),

  linkedin: z
    .enum(["Sim", "Não"])
    .describe(
      "Indica se a vaga foi divulgada no LinkedIn ou menciona o LinkedIn. " +
      "'Sim' se o texto contiver 'linkedin.com' ou a palavra 'LinkedIn'. " +
      "'Não' caso contrário."
    ),

  internacional: z
    .enum(["Sim", "Não"])
    .describe(
      "'Sim' se o texto da vaga estiver predominantemente em inglês. " +
      "'Não' se estiver em português, mesmo que mencione empresa estrangeira."
    ),
});

export type VacancyForm = z.infer<typeof VacancyFormSchema>;

// ─── Schema do resultado de validação ────────────────────────────────────────

export const ValidationResultSchema = z.object({
  isValid: z.boolean()
    .describe("true se o dado está válido e pronto para publicar"),

  feedback: z.string().min(1)
    .describe(
      "Sempre preenchido. Se isValid=true: confirmação breve. " +
      "Se isValid=false: descrição específica do problema e como corrigir."
    ),

  correctedForm: VacancyFormSchema.optional()
    .describe(
      "Preenchido APENAS quando isValid=false e o Supervisor consegue corrigir. " +
      "DEVE ter TODOS os campos obrigatórios preenchidos. " +
      "Nunca parcialmente preenchido."
    ),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;
```

---

## 3. Definição Campo a Campo

### 3.1 `vaga` — Título da Vaga

| Atributo | Valor |
|---|---|
| Tipo | `string` (obrigatório) |
| Origem | Primeira linha do texto bruto (código determinístico) |
| Limpeza | Remove emojis, "VAGA:", localidade, empresa, nível |

**Exemplos:**

| Input (primeira linha) | Output esperado |
|---|---|
| `🚀 VAGA: Dev Sênior PHP - São Paulo` | `Dev Sênior PHP` |
| `Desenvolvedor Full Stack Sr` | `Desenvolvedor Full Stack Sr` |
| `CIENTISTA DE DADOS SÊNIOR - 100% remoto` | `Cientista de Dados Sênior` |
| `Consultor SAP DRC/TDF/Tax One \| Hibrido - Brooklin` | `Consultor SAP DRC/TDF/Tax One` |
| `Boa tarde!! 🚀🚀` | *(não é título — workflow deve tratar como input inválido)* |

**Regra crítica:** A extração da primeira linha é feita por código (`extractFirstLine` + `cleanJobTitle`), não pelo LLM. O LLM não deve ter autonomia sobre este campo.

---

### 3.2 `empresa` — Empresa

| Atributo | Valor |
|---|---|
| Tipo | `string` (obrigatório) |
| Fallback | `"Empresa indefinida"` |

**Exemplos de onde encontrar:**
- "Vaga para a **Empresa X**"
- "Somos a **StartupY**"
- Email de contato `@empresa.com.br`
- Assinatura no final do texto

---

### 3.3 `nivel` — Nível de Senioridade

| Valor | Quando usar |
|---|---|
| `"Júnior"` | "Junior", "Jr", "Jr.", 0-2 anos |
| `"Pleno"` | "Pleno", "Mid", "Mid-level", 2-5 anos |
| `"Sênior"` | "Sênior", "Sr", "Sr.", "Senior", 5+ anos |
| `"Lead"` | "Lead", "Tech Lead", "Liderança técnica" |
| `"Especialista"` | "Especialista", "Expert", "Staff", "Principal" |
| `"Indefinido"` | Não mencionado ou impossível inferir |

**Regra de ambiguidade:** `"Especialista / Sênior"` → `"Especialista"` (mais alto).
`"Pleno/Sênior"` → `"Sênior"`. Nunca retornar valor combinado.

---

### 3.4 `area` — Área

| Valor | Exemplos de cargo |
|---|---|
| `"Dev"` | Desenvolvedor, Engenheiro de Software, Data Scientist, QA, DevOps, SRE, UX Engineer, Mobile Dev |
| `"Business"` | Vendas, Marketing, Financeiro, RH, Jurídico, Product Manager (não técnico), Customer Success |
| `"Indefinido"` | Genuinamente impossível classificar |

**Regra:** Em caso de dúvida entre Dev e Business para cargos híbridos (ex: "Product Designer"), analisar se a descrição exige habilidades técnicas de código ou ferramentas de desenvolvimento. Se sim → Dev.

---

### 3.5 `tipo` — Modelo de Trabalho

| Valor | Quando usar |
|---|---|
| `"Remoto"` | "remoto", "100% remoto", "home office", "remote" |
| `"Híbrido"` | "híbrido", "hybrid", múltiplos modelos mencionados |
| `"Presencial"` | "presencial", "on-site", local de escritório especificado sem mencionar remoto |
| `"Indefinido"` | Não mencionado |

---

### 3.6 `local` — Localização

| Caso | Formato |
|---|---|
| Remoto sem sede | `"Remoto"` |
| Cidade específica | `"São Paulo - SP"` |
| Híbrido com cidade | `"São Paulo - SP (Híbrido)"` |
| País estrangeiro | `"Remote (USA)"` ou `"Austin - TX, EUA"` |

---

### 3.7 `stack` — Tecnologias

- Separar por vírgula: `"Node.js, TypeScript, PostgreSQL, Docker, AWS"`
- Normalizar nomes: `"nodejs"` → `"Node.js"`, `"ts"` → `"TypeScript"`
- Se não mencionado: `"Indefinido"` (nunca string vazia)
- Incluir: linguagens, frameworks, banco de dados, cloud, ferramentas relevantes

---

### 3.8 `descricao` — Descrição Estruturada

Estrutura obrigatória em markdown:

```markdown
#### 🎯 Principais Atividades
- [atividade 1]
- [atividade 2]

#### ✅ Requisitos Técnicos
- [requisito 1]
- [requisito 2]

#### 🌟 Diferenciais
- [diferencial 1]
(incluir somente se mencionado no texto original)

#### 💰 Benefícios
- [benefício 1]
(incluir somente se mencionado no texto original)
```

**Regras:**
- Usar `####` (H4) — nunca `###` ou `##`
- Não inventar conteúdo que não está no texto original
- Listas com `-` (não `*`)
- Máximo 8 itens por seção

---

### 3.9 `aplicar` — Contato Primário

Exemplos de valores válidos:
- `"https://vagas.empresa.com/dev-senior"` (URL de candidatura)
- `"recrutamento@empresa.com.br"` (email)
- `"+55 11 99999-9999"` (telefone)
- `"https://linkedin.com/jobs/view/123456"` (link da vaga no LinkedIn)

**Regra:** Apenas UM valor. Se URL e email estão presentes, usar URL.

---

### 3.10 `linkVaga` — Contato Secundário (opcional)

Omitir se não existir segundo contato. Quando presente, pode ser:
- Link da postagem original (WhatsApp, grupo, etc.)
- Email secundário
- Perfil do recrutador no LinkedIn

---

### 3.11 `linkedin` e `internacional`

Detectados deterministicamente por código:
```typescript
linkedin = detectLinkedIn(inputText)    // "Sim" | "Não"
internacional = detectInternational(inputText)  // "Sim" | "Não"
```
O LLM não deve decidir esses campos — ver `deterministic-extraction.md`.

---

## 4. Regras do Supervisor para este Schema

Estas são as `SupervisorRule[]` que devem ser passadas ao `SupervisorAgent`:

```typescript
// src/skills/tech-recruiter/supervisor.ts

export const VACANCY_SUPERVISOR_RULES: SupervisorRule[] = [
  {
    field: "nivel",
    rule: "Deve ser exatamente um dos 6 valores do enum. NUNCA valores combinados com '/' ou 'e'.",
    example: "ERRADO: 'Pleno/Sênior'. CORRETO: 'Sênior' (use o mais alto)."
  },
  {
    field: "area",
    rule: "Deve ser 'Dev' ou 'Business'. Use 'Indefinido' somente se genuinamente impossível classificar. Cargos técnicos são sempre 'Dev'.",
    example: "Data Scientist → 'Dev'. Product Manager de negócios → 'Business'."
  },
  {
    field: "vaga",
    rule: "Não deve conter emojis, 'VAGA:', localidade, nome da empresa ou nível de senioridade.",
    example: "ERRADO: '🚀 Dev Sênior - SP'. CORRETO: 'Dev Sênior'."
  },
  {
    field: "stack",
    rule: "Deve ter valor. Nunca string vazia. Use 'Indefinido' se nenhuma tecnologia mencionada.",
  },
  {
    field: "aplicar",
    rule: "Deve conter exatamente UM contato primário. Não pode estar vazio.",
  },
  {
    field: "descricao",
    rule: "Deve conter pelo menos as seções '#### 🎯 Principais Atividades' e '#### ✅ Requisitos Técnicos' com itens de lista.",
  },
  {
    field: "empresa",
    rule: "Nunca pode estar vazio. Use 'Empresa indefinida' se não identificada.",
  }
];
```

---

## 5. Formato Final da Issue no GitHub

O `publisher.ts` monta o corpo da issue a partir do `VacancyForm` aprovado:

```typescript
export function buildIssueBody(form: VacancyForm): string {
  return [
    `### Empresa`,
    form.empresa,
    ``,
    `### Nível`,
    form.nivel,
    ``,
    `### Área`,
    form.area,
    ``,
    `### Tipo`,
    form.tipo,
    ``,
    `### Localização`,
    form.local,
    ``,
    `### Salário`,
    form.salario ?? "A combinar",
    ``,
    `### Stack`,
    form.stack,
    ``,
    `### Descrição da Vaga`,
    form.descricao,
    ``,
    `### Como se candidatar`,
    form.aplicar,
    ``,
    `### Link para se candidatar`,
    form.linkVaga ?? "Não informado",
    ``,
    `### Publicada no LinkedIn?`,
    form.linkedin ?? "Não",
    ``,
    `### Vaga Internacional?`,
    form.internacional ?? "Não",
    ``,
    `### Confirmação`,
    `- [x] Confirmo que esta é uma vaga real e estou autorizado a divulgá-la`,
  ].join("\n");
}

export function buildIssueLabels(form: VacancyForm): string[] {
  const labels = ["vaga"];

  if (form.area === "Dev") labels.push("dev");
  if (form.area === "Business") labels.push("business");

  if (form.tipo === "Remoto") labels.push("remoto");
  if (form.tipo === "Híbrido") labels.push("hibrido");
  if (form.tipo === "Presencial") labels.push("presencial");

  if (form.nivel === "Júnior") labels.push("junior");
  if (form.nivel === "Pleno") labels.push("pleno");
  if (form.nivel === "Sênior") labels.push("senior");
  if (form.nivel === "Lead") labels.push("lead");
  if (form.nivel === "Especialista") labels.push("especialista");

  return labels;
}
```

**Título da issue:** `[VAGA] ${form.vaga}` (publisher adiciona o prefixo)
