import { ChatMessage } from "../../lib/structured-llm/IStructuredLLMClient";
import { createStructuredClient } from "../../lib/structured-llm/StructuredClientFactory";
import { VacancyFormSchema, VacancyForm } from "./schema";
import { TECH_RECRUITER_SYSTEM_PROMPT } from "./prompts";
import { extractAllContacts, detectLinkedIn, detectInternational } from "../../lib/deterministic";

const client = createStructuredClient(process.env.EXTRACTOR_MODEL);

export async function extractVacancy(
  inputText: string,
  feedbackHistory: string[] // ← injetado pelo Workflow em retries
): Promise<VacancyForm> {
  const messages: ChatMessage[] = [
    { role: "system", content: TECH_RECRUITER_SYSTEM_PROMPT }
  ];

  // Em retries, adiciona contexto de correção ANTES do texto da vaga
  if (feedbackHistory.length > 0) {
    const correction = [
      "⚠️ CORREÇÃO NECESSÁRIA — Esta é uma tentativa de reextração.",
      "Nas tentativas anteriores, os seguintes problemas foram identificados pelo validador:",
      ...feedbackHistory.map((f, i) => `  [Tentativa ${i + 1}]: ${f}`),
      "",
      "Corrija ESPECIFICAMENTE esses pontos ao processar o texto abaixo.",
    ].join("\n");

    messages.push({ role: "user", content: correction });
    messages.push({
      role: "assistant",
      content: "Compreendido. Vou corrigir especificamente esses pontos na extração."
    });
  }

  messages.push({ role: "user", content: inputText });

  const extracted = await client.generateStructuredOutput(messages, VacancyFormSchema);

  // Pós-processamento determinístico (não LLM) — sobrescreve apenas campos objetivos
  // extracted.vaga é deixado para o LLM: ele ignora prefixos de comando ("Crie uma issue", etc.)
  const [primaryContact, secondaryContact] = extractAllContacts(inputText);
  extracted.aplicar = primaryContact || extracted.aplicar;
  extracted.linkVaga = secondaryContact || extracted.linkVaga;
  extracted.linkedin = detectLinkedIn(inputText);
  extracted.internacional = detectInternational(inputText);

  // Normaliza quebras de linha na descricao: LLMs frequentemente colapsam \n em espaços duplos
  // Remove também emojis dos headers #### para manter formatação limpa
  extracted.descricao = extracted.descricao
    .replace(/\s{2,}(#{4})/g, '\n\n$1')                     // espaços antes de seções #### → \n\n####
    .replace(/\s{2,}-\s/g, '\n- ')                           // espaços antes de itens de lista → \n-
    .replace(/(#{4}\s+)[\p{Emoji}\u200d\ufe0f]+\s*/gu, '$1') // remove emojis após ####
    .trim();

  return extracted;
}
