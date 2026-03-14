import { z } from "zod";
import { IStructuredLLMClient } from "../structured-llm/IStructuredLLMClient";
import { SupervisorAgent } from "../supervisor/SupervisorAgent";
import { SupervisorRule } from "../supervisor/ISupervisor";
import { decideSupervisorAction } from "../supervisor/WorkflowDecision";
import { initialState } from "./WorkflowState";

export interface ExtractorFn<T> {
  (inputText: string, feedbackHistory: string[]): Promise<T>;
}

export interface PublisherFn<T> {
  (data: T): Promise<string>; // retorna URL ou ID do recurso criado
}

export interface WorkflowConfig<T extends z.ZodType> {
  schema: T;
  extractor: ExtractorFn<z.infer<T>>;
  publisher: PublisherFn<z.infer<T>>;
  supervisorRules: SupervisorRule[];
  supervisorClient: IStructuredLLMClient;
  maxRetries?: number; // padrão: 3
}

export interface WorkflowResult<T> {
  success: boolean;
  url?: string;
  data?: T;
  error?: string;
  retries: number;
}

export class MultiAgentWorkflow<T extends z.ZodType> {
  private supervisor: SupervisorAgent<T>;
  private maxRetries: number;

  constructor(private config: WorkflowConfig<T>) {
    this.supervisor = new SupervisorAgent(config.supervisorClient, config.schema);
    this.maxRetries = config.maxRetries ?? 3;
  }

  async run(inputText: string): Promise<WorkflowResult<z.infer<T>>> {
    let state = initialState<z.infer<T>>(inputText);

    while (state.retryCount <= this.maxRetries) {
      // ── Etapa 1: Extração ──────────────────────────────────────
      console.log(`[Workflow] Extração — tentativa ${state.retryCount + 1}/${this.maxRetries + 1}`);

      state.extracted = await this.config.extractor(
        state.inputText,
        state.feedbackHistory
      );

      console.log("[Workflow] Dado extraído:", JSON.stringify(state.extracted, null, 2));

      // ── Etapa 2: Validação ─────────────────────────────────────
      state.validationResult = await this.supervisor.validate(
        state.extracted,
        this.config.supervisorRules
      );

      console.log(`[Workflow] Supervisor: isValid=${state.validationResult.isValid} | feedback="${state.validationResult.feedback}"`);

      // ── Etapa 3: Decisão ───────────────────────────────────────
      const decision = decideSupervisorAction(
        state.validationResult,
        state.extracted,
        state.retryCount,
        this.maxRetries
      );

      switch (decision.action) {
        case "publish":
          console.log("[Workflow] Publicando dado aprovado...");
          state.issueUrl = await this.config.publisher(decision.data);
          return { success: true, url: state.issueUrl, data: decision.data, retries: state.retryCount };

        case "publish_corrected":
          console.log("[Workflow] Publicando correctedForm do Supervisor...");
          state.issueUrl = await this.config.publisher(decision.data);
          return { success: true, url: state.issueUrl, data: decision.data, retries: state.retryCount };

        case "retry":
          console.log(`[Workflow] Retry ${state.retryCount + 1} — feedback: "${decision.feedback}"`);
          // Acumula feedback para injetar no próximo Extrator
          state = {
            ...state,
            extracted: null,
            validationResult: null,
            retryCount: state.retryCount + 1,
            feedbackHistory: [...state.feedbackHistory, decision.feedback]
          };
          break; // volta para o while

        case "fail":
          console.error("[Workflow] Falha após max retries:", decision.feedback);
          return { success: false, error: decision.feedback, retries: state.retryCount };
      }
    }

    // Nunca deve chegar aqui, mas TypeScript exige
    return { success: false, error: "Loop encerrado sem decisão", retries: state.retryCount };
  }
}
