import { ValidationResult } from "./ISupervisor";

export type SupervisorDecision<T> =
  | { action: "publish"; data: T }           // isValid=true
  | { action: "publish_corrected"; data: T } // isValid=false + correctedForm
  | { action: "retry"; feedback: string }    // isValid=false, sem correctedForm, retry < MAX
  | { action: "fail"; feedback: string };    // retry >= MAX

export function decideSupervisorAction<T>(
  result: ValidationResult<T>,
  originalData: T,
  retryCount: number,
  maxRetries: number
): SupervisorDecision<T> {
  if (result.isValid) {
    return { action: "publish", data: result.correctedForm ?? originalData };
  }

  if (result.correctedForm) {
    return { action: "publish_corrected", data: result.correctedForm };
  }

  if (retryCount < maxRetries) {
    return { action: "retry", feedback: result.feedback };
  }

  return { action: "fail", feedback: result.feedback };
}
