import { ValidationResult } from "../supervisor/ISupervisor";

export interface WorkflowState<T> {
  inputText: string;                           // texto bruto original — NUNCA modificado
  extracted: T | null;                         // output do Extrator na iteração atual
  validationResult: ValidationResult<T> | null; // resultado do Supervisor
  issueUrl: string | null;                     // resultado da publicação
  retryCount: number;                          // número de retries já executados
  feedbackHistory: string[];                   // histórico de feedbacks acumulados
}

export const initialState = <T>(inputText: string): WorkflowState<T> => ({
  inputText,
  extracted: null,
  validationResult: null,
  issueUrl: null,
  retryCount: 0,
  feedbackHistory: []
});
