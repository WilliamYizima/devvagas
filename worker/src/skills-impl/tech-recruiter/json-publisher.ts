import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { VacancyForm, buildIssueBody } from "./schema";
import { normalizeNewlines } from "../../lib/deterministic";

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getJobsJsonPath(): string {
  // __dirname em CJS aponta para dist/skills-impl/tech-recruiter/
  // sobe 4 níveis até a raiz do projeto, depois desce para src/data/jobs.json
  return process.env.JOBS_JSON_PATH ?? join(__dirname, "../../../../src/data/jobs.json");
}

export async function publishVacancyToJson(form: VacancyForm): Promise<string> {
  const path = getJobsJsonPath();

  let jobs: any[] = [];
  try {
    jobs = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    jobs = [];
  }

  const maxId = jobs.reduce((max: number, j: any) => Math.max(max, j.id ?? 0), 0);
  const newId = maxId + 1;
  const now = new Date().toISOString();

  const body = normalizeNewlines(buildIssueBody(form));
  const stack = form.stack
    .split(/[,;/]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  const job = {
    id: newId,
    title: form.vaga,
    body,
    url: "",
    createdAt: now,
    updatedAt: now,
    author: { login: "system", avatar: "", url: "" },
    labels: [],
    empresa: form.empresa,
    nivel: form.nivel,
    tipo: form.tipo,
    local: form.local,
    salario: form.salario || "A combinar",
    stack,
    descricao: form.descricao,
    aplicar: form.aplicar,
    linkVaga: form.linkVaga ?? "",
    isRemote: form.tipo === "Remoto" || /remot/i.test(form.local),
    isLinkedin: form.linkedin === "Sim",
    isInternacional: form.internacional === "Sim" || /\b(portugal|espanha|spain|usa|united states|uk|united kingdom|canada|alemanha|germany|france|fran[cç]a|holanda|netherlands|irlanda|ireland|australia|austrália|argentina|chile|m[eé]xico|colombia|col[oô]mbia)\b/i.test(form.local),
    slug: toSlug(form.vaga),
  };

  jobs.unshift(job);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(jobs, null, 2) + "\n");

  console.log(`[JsonPublisher] Vaga #${newId} "${form.vaga}" adicionada em ${path}`);
  return `local://jobs.json#${newId}`;
}
