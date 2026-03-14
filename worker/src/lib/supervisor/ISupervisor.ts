import { z } from "zod";

export interface ValidationResult<T> {
  isValid: boolean;
  feedback: string;       // sempre preenchido, mesmo quando isValid=true
  correctedForm?: T;      // preenchido quando isValid=false e Supervisor conseguiu corrigir
}

export interface SupervisorRule {
  field: string;          // nome do campo no schema
  rule: string;           // descrição da regra em linguagem natural
  example?: string;       // exemplo de valor correto vs incorreto
}

export interface ISupervisor<T> {
  validate(
    data: T,
    rules: SupervisorRule[]
  ): Promise<ValidationResult<T>>;
}
