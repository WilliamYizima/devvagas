# Spec: Extração Determinística (Código sobre LLM)

**Versão:** 1.0
**Status:** Referência
**Autor:** Boro Agent
**Data:** 2026-03-13

---

## 1. Resumo

Extração Determinística é o princípio de que campos com regras de extração objetivas e invariáveis devem ser extraídos por código, não por LLM. O LLM é convocado apenas para o que exige compreensão semântica. Para o resto, código é superior: é 100% determinístico, zero custo de token, e nunca "interpreta" algo que deveria copiar literalmente.

O exemplo canônico do projeto antigo: o campo `vaga` (título da vaga) é sempre a primeira linha não-vazia do texto bruto — extraída por código, depois do LLM call, sobrescrevendo qualquer interpretação do modelo.

---

## 2. Contexto e Motivação

**Problema:**
LLMs tendem a "melhorar" textos mesmo quando instruídos a copiar literalmente. O campo `vaga` com instrução "use a primeira linha do texto" frequentemente voltava com a linha "limpa e melhorada" pelo modelo: emojis removidos, capitalização alterada, palavras reorganizadas. A instrução era seguida na intenção, mas não na letra.

**Evidências:**
Input: `"🚀 DEV SÊNIOR PLENO - São Paulo"`
- Com LLM: `"Desenvolvedor Sênior Pleno"` (LLM "ajudou")
- Com código: `"🚀 DEV SÊNIOR PLENO - São Paulo"` (exato)

Resultado esperado após limpeza determinística: `"Dev Sênior Pleno"` (regra de limpeza aplicada por código, não LLM).

**Por que agora:**
Qualquer campo que siga uma regra objetiva, sem ambiguidade semântica, é candidato a extração determinística. Isso reduz erros, reduz tokens, e torna o comportamento auditável.

---

## 3. Princípio: Quando Usar Código vs. LLM

| Tipo de Extração | Usar | Exemplo |
|---|---|---|
| Cópia literal com transformação simples | Código | Primeira linha; remover prefixo fixo; regex |
| Detecção de padrão estrutural | Código | URL, email, CPF, data no formato ISO |
| Inferência semântica | LLM | "Qual o nível desta vaga?" |
| Compreensão de intenção | LLM | "Esta é uma vaga de Dev ou Business?" |
| Classificação com contexto ambíguo | LLM | "Qual o tipo de trabalho: remoto, híbrido ou presencial?" |

**Regra prática:** Se você consegue escrever o teste unitário sem usar um LLM como oráculo, é código. Se não, é LLM.

---

## 4. Biblioteca de Funções Determinísticas

```typescript
// src/lib/deterministic/index.ts
```

### 4.1 extractFirstLine

```typescript
/**
 * Extrai a primeira linha não-vazia de um texto.
 * Usado para garantir que o título (vaga) seja sempre a primeira linha literal,
 * independentemente do que o LLM retornou.
 *
 * @param text - Texto bruto de entrada
 * @returns Primeira linha não-vazia, com trim. Nunca vazio (retorna "" se não encontrar).
 */
export function extractFirstLine(text: string): string {
  return text
    .split("\n")
    .map(line => line.trim())
    .find(line => line.length > 0) ?? "";
}

// Tests:
// extractFirstLine("") → ""
// extractFirstLine("\n\n🚀 Dev Sênior\nOutra linha") → "🚀 Dev Sênior"
// extractFirstLine("  \t  \nTexto") → "Texto"
```

### 4.2 cleanJobTitle

```typescript
/**
 * Limpa o título de uma vaga removendo elementos que não fazem parte do cargo:
 * - Emojis
 * - Prefixo "VAGA:" (case-insensitive)
 * - Localidade no padrão "- São Paulo", "| SP", "(Remoto)"
 * - Nome de empresa no padrão "@ Empresa", "| Empresa"
 *
 * IMPORTANTE: Esta função opera sobre a primeira linha já extraída.
 * Não deve ser aplicada ao texto completo da vaga.
 *
 * @param title - Primeira linha da vaga
 * @returns Título limpo com trim
 */
export function cleanJobTitle(title: string): string {
  return title
    // Remove emojis (Unicode range)
    .replace(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "")
    // Remove prefixos fixos: "VAGA:", "🔥 VAGA:", etc.
    .replace(/^(vaga:?\s*)+/i, "")
    // Remove separadores + localidade no final: "- São Paulo", "| SP", "(100% Remoto)"
    .replace(/[\-\|]\s*(100%\s*)?(remoto|hibrido|híbrido|presencial|sp|rj|mg|ba|[a-záàãâéêíóôõúüç\s]+)\s*$/i, "")
    // Remove parênteses com localidade: "(São Paulo)" "(Remoto)"
    .replace(/\([^)]*\)\s*$/i, "")
    // Remove empresa após @ ou |: "| Empresa X", "@EmpresaX"
    .replace(/[@|][\s\w]+$/, "")
    // Normaliza espaços múltiplos
    .replace(/\s+/g, " ")
    .trim();
}

// Tests:
// cleanJobTitle("🚀 VAGA: Dev Sênior - São Paulo") → "Dev Sênior"
// cleanJobTitle("Dev Sênior | Empresa X") → "Dev Sênior"
// cleanJobTitle("Dev Sênior (100% Remoto)") → "Dev Sênior"
// cleanJobTitle("Consultor SAP DRC | Híbrido - Brooklin") → "Consultor SAP DRC"
```

### 4.3 extractContact

```typescript
/**
 * Extrai o contato primário de um texto livre.
 * Prioridade: URL > email > telefone
 * Retorna apenas UM contato (o mais direto).
 *
 * @param text - Texto onde procurar o contato
 * @returns Contato primário encontrado, ou "" se nenhum
 */
export function extractPrimaryContact(text: string): string {
  // 1. URL (prioridade máxima)
  const urlMatch = text.match(/https?:\/\/[^\s,;)]+/);
  if (urlMatch) return urlMatch[0];

  // 2. Email
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  if (emailMatch) return emailMatch[0];

  // 3. Telefone (BR: com ou sem código de país, com ou sem DDD)
  const phoneMatch = text.match(/(?:\+55\s?)?(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-\s]?\d{4}/);
  if (phoneMatch) return phoneMatch[0].trim();

  return "";
}
```

### 4.4 detectLanguage

```typescript
/**
 * Detecta se o texto está predominantemente em inglês.
 * Usado para o campo `internacional`.
 * Heurística: presença de palavras-chave em inglês no início do texto.
 *
 * @param text - Texto da vaga
 * @returns "Sim" se inglês, "Não" se português
 */
export function detectInternational(text: string): "Sim" | "Não" {
  const sample = text.slice(0, 500).toLowerCase();
  const englishIndicators = [
    /\b(we are|we're|join our|looking for|you will|you'll|must have|nice to have)\b/,
    /\b(responsibilities|requirements|qualifications|benefits|apply now)\b/,
    /\b(full.?time|part.?time|remote|hybrid|on.?site)\b/
  ];

  const matches = englishIndicators.filter(re => re.test(sample)).length;
  return matches >= 2 ? "Sim" : "Não";
}
```

### 4.5 detectLinkedIn

```typescript
/**
 * Detecta se a vaga menciona LinkedIn.
 * Usado para o campo `linkedin`.
 *
 * @param text - Texto completo da vaga
 * @returns "Sim" se LinkedIn encontrado, "Não" caso contrário
 */
export function detectLinkedIn(text: string): "Sim" | "Não" {
  return /linkedin\.com|linkedin/i.test(text) ? "Sim" : "Não";
}
```

### 4.6 normalizeNewlines

```typescript
/**
 * Normaliza newlines escapadas que alguns modelos LLM retornam como literal "\\n"
 * em vez do caractere de quebra de linha real "\n".
 * Necessário antes de montar o corpo de uma issue GitHub.
 *
 * @param text - Texto possivelmente com newlines escapadas
 * @returns Texto com newlines reais
 */
export function normalizeNewlines(text: string): string {
  return text.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}
```

---

## 5. Onde Aplicar: Pós-Processamento após LLM Call

O padrão correto é: **LLM extrai, código corrige campos determinísticos**.

```typescript
// src/skills/tech-recruiter/extractor.ts

export async function extractVacancy(
  inputText: string,
  feedbackHistory: string[]
): Promise<VacancyForm> {

  // 1. LLM extrai o formulário
  const form = await client.generateStructuredOutput(
    buildMessages(inputText, feedbackHistory),
    VacancyFormSchema
  );

  // 2. Pós-processamento determinístico (sobrescreve LLM onde a regra é objetiva)
  const firstLine = extractFirstLine(inputText);
  form.vaga = cleanJobTitle(firstLine);

  // Se o LLM não conseguiu extrair contato, tentar via regex
  if (!form.aplicar || form.aplicar.trim() === "") {
    form.aplicar = extractPrimaryContact(inputText) || "Não informado";
  }

  // Detecção determinística de internacional e linkedin
  form.internacional = detectInternational(inputText);
  form.linkedin = detectLinkedIn(inputText);

  // Normalizar newlines no campo de descrição (quirk de alguns modelos)
  form.descricao = normalizeNewlines(form.descricao);

  return form;
}
```

---

## 6. Hierarquia de Confiança

```
MAIOR CONFIANÇA
    │
    ▼
[1] Código determinístico       → campos com regra objetiva (título, contatos)
[2] Schema Zod (structured output) → garante tipos e enums
[3] Supervisor Agent            → valida semântica e completude
[4] Extrator LLM                → inferência semântica geral
    │
    ▼
MENOR CONFIANÇA (sem garantias técnicas)
[5] Instruções no prompt (SKILL.md) → sem enforcement técnico
```

O projeto novo opera principalmente nos níveis 4 e 5. O projeto antigo empilha os níveis 1, 2, 3 e 4, o que explica a diferença de assertividade.

---

## 7. Testes Unitários Obrigatórios

Toda função determinística deve ter testes unitários completos. Por serem puramente funcionais (input/output, sem side effects), são triviais de testar.

```typescript
// src/lib/deterministic/__tests__/index.test.ts

describe("extractFirstLine", () => {
  it("retorna primeira linha não-vazia", () => {
    expect(extractFirstLine("\n\n🚀 Dev Sênior\nOutra")).toBe("🚀 Dev Sênior");
  });
  it("retorna string vazia se texto vazio", () => {
    expect(extractFirstLine("")).toBe("");
  });
});

describe("cleanJobTitle", () => {
  it("remove emoji do início", () => {
    expect(cleanJobTitle("🚀 Dev Sênior")).toBe("Dev Sênior");
  });
  it("remove prefixo VAGA:", () => {
    expect(cleanJobTitle("VAGA: Dev Sênior")).toBe("Dev Sênior");
  });
  it("remove localidade com traço", () => {
    expect(cleanJobTitle("Dev Sênior - São Paulo")).toBe("Dev Sênior");
  });
  it("não remove palavras do cargo que parecem localidade", () => {
    expect(cleanJobTitle("Engenheiro de Software")).toBe("Engenheiro de Software");
  });
});
```

---

## 8. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | `extractFirstLine` deve retornar a primeira linha não-vazia exatamente como está no input | Must | Teste: `"\n\n🚀 Dev"` → `"🚀 Dev"` (sem trim além do leading/trailing whitespace) |
| RF-02 | Pós-processamento determinístico deve ocorrer DEPOIS do LLM call, nunca antes | Must | O LLM recebe o input original — o código corrige depois |
| RF-03 | Funções determinísticas devem ser puras (sem side effects, sem dependências externas) | Must | 100% testáveis com testes unitários simples |
| RF-04 | `normalizeNewlines` deve ser aplicado a todos os campos de texto longo | Should | Issues no GitHub nunca exibem `\n` literal |

---

## 9. Edge Cases e Tratamento de Erros

| Cenário | Comportamento esperado |
|---|---|
| Texto bruto vazio | `extractFirstLine("")` → `""`. `cleanJobTitle("")` → `""`. O workflow detecta campo vazio e falha controladamente |
| Primeira linha é só emojis (ex: `"🚀🔥💻"`) | `cleanJobTitle` remove emojis → `""`. Neste caso, não sobrescrever `form.vaga` com string vazia — manter o que o LLM retornou |
| Múltiplos emails no texto | `extractPrimaryContact` retorna o primeiro encontrado (mais próximo do início) |
| Descrição da vaga em inglês mas título em português | `detectInternational` analisa apenas os primeiros 500 chars — se o título for PT, pode retornar "Não" erroneamente. Aceitável como heurística |

---

## 10. Open Questions

- Avaliar se `cleanJobTitle` deve usar uma lista de sufixos de localidade (cidades brasileiras) para maior precisão, ou se a heurística atual por regex é suficiente.
- Definir se funções determinísticas devem ser expostas como `DeterministicTools` no `ToolRegistry` para que o AgentLoop possa invocá-las diretamente, ou se ficam como utilitários internos dos extractors.
