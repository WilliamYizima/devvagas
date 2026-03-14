import { z } from "zod";
import { IStructuredLLMClient } from "../structured-llm/IStructuredLLMClient";
import { ISupervisor, ValidationResult, SupervisorRule } from "./ISupervisor";

export class SupervisorAgent<T extends z.ZodType> implements ISupervisor<z.infer<T>> {
  private validationSchema: z.ZodType;

  constructor(
    private client: IStructuredLLMClient,
    private outputSchema: T
  ) {
    // Constrói o schema de ValidationResult dinamicamente com base no outputSchema
    this.validationSchema = z.object({
      isValid: z.boolean(),
      feedback: z.string().min(1),
      correctedForm: outputSchema.optional()
    });
  }

  async validate(
    data: z.infer<T>,
    rules: SupervisorRule[]
  ): Promise<ValidationResult<z.infer<T>>> {
    const systemPrompt = this.buildSystemPrompt(rules);
    const userMessage = JSON.stringify(data, null, 2);

    const result = await this.client.generateStructuredOutput(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Valide o seguinte dado:\n\n${userMessage}` }
      ],
      this.validationSchema,
      { thinking: true } // extended thinking para raciocínio mais cuidadoso
    );

    // Garantia de segurança: se isValid=false e há correctedForm,
    // o correctedForm DEVE passar no schema do output original
    if (!result.isValid && result.correctedForm) {
      try {
        this.outputSchema.parse(result.correctedForm);
      } catch (err) {
        // correctedForm inválido — tratar como se não existisse
        console.warn("[Supervisor] correctedForm não passou no schema Zod:", err);
        return { ...result, correctedForm: undefined };
      }
    }

    return result;
  }

  private buildSystemPrompt(rules: SupervisorRule[]): string {
    const rulesText = rules
      .map((r, i) => {
        let text = `${i + 1}. Campo \`${r.field}\`: ${r.rule}`;
        if (r.example) text += `\n   Exemplo: ${r.example}`;
        return text;
      })
      .join("\n");

    return `Você é um agente validador especializado. Sua única função é verificar se um dado estruturado está completo e consistente.

## Regras de Validação

${rulesText}

## Comportamento Esperado

- Se o dado está válido: retorne \`isValid: true\` e um feedback confirmando brevemente.
- Se encontrou problema mas consegue corrigir: retorne \`isValid: false\`, explique o problema em \`feedback\`, e forneça o dado totalmente corrigido em \`correctedForm\` com TODOS os campos preenchidos.
- Se não consegue corrigir (informação genuinamente ausente no dado): retorne \`isValid: false\`, feedback detalhado, sem \`correctedForm\`.

## Regras Absolutas

- NUNCA rejeite por questões estéticas (formatação, estilo de escrita).
- NUNCA deixe \`correctedForm\` com campos faltando — ou está completo ou não existe.
- NÃO adicione informações que não estão no dado recebido.
- Trate campos opcionais ausentes como válidos (não rejeite por isso).
- Use valores padrão ("Indefinido", "Empresa indefinida") para campos obrigatórios sem valor claro.`;
  }
}
