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

/**
 * Extrai até dois contatos de um texto livre, em ordem de prioridade (URL > email > telefone).
 * Usado para preencher `aplicar` (primário) e `linkVaga` (secundário).
 *
 * @param text - Texto onde procurar os contatos
 * @returns Tupla [primário, secundário] — cada item é "" se não encontrado
 */
export function extractAllContacts(text: string): [string, string] {
  const urls = [...text.matchAll(/https?:\/\/[^\s,;)]+/g)].map(m => m[0]);
  const emails = [...text.matchAll(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)].map(m => m[0]);
  const phones = [...text.matchAll(/(?:\+55\s?)?(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-\s]?\d{4}/g)].map(m => m[0].trim());

  const all = [...urls, ...emails, ...phones];
  return [all[0] ?? "", all[1] ?? ""];
}

/**
 * Extrai o contato primário de um texto livre.
 * Prioridade: URL > email > telefone
 * Retorna apenas UM contato (o mais direto).
 *
 * @param text - Texto onde procurar o contato
 * @returns Contato primário encontrado, ou "" se nenhum
 */
export function extractPrimaryContact(text: string): string {
  return extractAllContacts(text)[0];
}

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
