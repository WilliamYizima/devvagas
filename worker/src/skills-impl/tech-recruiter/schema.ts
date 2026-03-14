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
      "'#### Principais Atividades', " +
      "'#### Requisitos Técnicos', " +
      "'#### Diferenciais' (se mencionado), " +
      "'#### Benefícios' (se mencionado). " +
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

// ─── Helpers para publicação no GitHub ───────────────────────────────────────

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
    form.salario || "A combinar",
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
    form.linkVaga || "",
    ``,
    `### Publicada no LinkedIn`,
    form.linkedin ?? "Não",
    ``,
    `### Vaga Internacional`,
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
