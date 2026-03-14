import { BaseTool } from "./BaseTool";
import { createVacancyWorkflow } from "../skills-impl/tech-recruiter/workflow";
import { ExecutionContext } from "../lib/ExecutionContext";

interface ProcessVacancyArgs {
  text: string;
}

export class ProcessVacancyTool extends BaseTool {
  readonly name = "process_vacancy";
  readonly description =
    "Processa o texto de uma vaga de emprego: extrai dados, valida e salva no jobs.json. " +
    "Use esta ferramenta quando o usuário enviar o texto de uma vaga para ser publicada.";

  readonly parameters = {
    type: "object" as const,
    properties: {
      text: {
        type: "string",
        description: "Texto bruto completo da vaga de emprego, exatamente como recebido."
      }
    },
    required: ["text"]
  };

  async execute(_args: Record<string, unknown>): Promise<string> {
    // Always use the original, unmodified user message from ExecutionContext.
    // The LLM-generated `text` argument is intentionally ignored here because
    // small models (e.g. 7B) often truncate long vacancy texts when generating
    // tool call arguments, silently dropping the last lines (contacts, emails).
    const text = ExecutionContext.getUserText();
    const workflow = createVacancyWorkflow();
    const result = await workflow.run(text);

    if (result.success) {
      const id = result.url?.split("#")[1] ?? "?";
      return [
        `✅ Vaga criada com sucesso!`,
        `🆔 ID: #${id}`,
        `📊 Tentativas necessárias: ${result.retries + 1}`,
      ].join("\n");
    }

    return [
      `❌ Não foi possível publicar a vaga após ${result.retries + 1} tentativas.`,
      `Motivo: ${result.error}`,
      `Sugestão: Verifique se o texto contém informações suficientes sobre a vaga.`,
    ].join("\n");
  }
}
