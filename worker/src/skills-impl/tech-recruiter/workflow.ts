import { MultiAgentWorkflow } from "../../lib/workflow/MultiAgentWorkflow";
import { VacancyFormSchema } from "./schema";
import { extractVacancy } from "./extractor";
import { VACANCY_SUPERVISOR_RULES } from "./supervisor";
import { publishVacancyToJson } from "./json-publisher";
import { createStructuredClient } from "../../lib/structured-llm/StructuredClientFactory";

export function createVacancyWorkflow() {
  const supervisorClient = createStructuredClient(process.env.SUPERVISOR_MODEL);

  return new MultiAgentWorkflow({
    schema: VacancyFormSchema,
    extractor: extractVacancy,
    publisher: publishVacancyToJson,
    supervisorRules: VACANCY_SUPERVISOR_RULES,
    supervisorClient,
    maxRetries: parseInt(process.env.MAX_RETRIES ?? "3")
  });
}
