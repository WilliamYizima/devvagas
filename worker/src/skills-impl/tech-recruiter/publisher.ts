import { VacancyForm, buildIssueBody, buildIssueLabels } from "./schema";
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
