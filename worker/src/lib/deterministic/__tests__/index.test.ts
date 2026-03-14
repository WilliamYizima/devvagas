import {
  extractFirstLine,
  cleanJobTitle,
  extractAllContacts,
  extractPrimaryContact,
  detectInternational,
  detectLinkedIn,
  normalizeNewlines,
} from "../index";

describe("extractFirstLine", () => {
  it("retorna primeira linha não-vazia", () => {
    expect(extractFirstLine("\n\n🚀 Dev Sênior\nOutra")).toBe("🚀 Dev Sênior");
  });
  it("retorna string vazia se texto vazio", () => {
    expect(extractFirstLine("")).toBe("");
  });
  it("faz trim da linha", () => {
    expect(extractFirstLine("  \t  \nTexto")).toBe("Texto");
  });
  it("retorna a primeira linha se não há linhas vazias antes", () => {
    expect(extractFirstLine("Dev Sênior\nOutra linha")).toBe("Dev Sênior");
  });
});

describe("cleanJobTitle", () => {
  it("remove emoji do início", () => {
    expect(cleanJobTitle("🚀 Dev Sênior")).toBe("Dev Sênior");
  });
  it("remove prefixo VAGA:", () => {
    expect(cleanJobTitle("VAGA: Dev Sênior")).toBe("Dev Sênior");
  });
  it("remove prefixo vaga: case-insensitive", () => {
    expect(cleanJobTitle("vaga: Dev Pleno")).toBe("Dev Pleno");
  });
  it("remove localidade com traço", () => {
    expect(cleanJobTitle("Dev Sênior - São Paulo")).toBe("Dev Sênior");
  });
  it("remove localidade com pipe", () => {
    expect(cleanJobTitle("Dev Sênior | SP")).toBe("Dev Sênior");
  });
  it("remove parênteses com localidade", () => {
    expect(cleanJobTitle("Dev Sênior (100% Remoto)")).toBe("Dev Sênior");
  });
  it("não remove palavras do cargo que parecem localidade", () => {
    expect(cleanJobTitle("Engenheiro de Software")).toBe("Engenheiro de Software");
  });
  it("remove empresa após pipe", () => {
    expect(cleanJobTitle("Dev Sênior | Empresa X")).toBe("Dev Sênior");
  });
});

describe("extractAllContacts", () => {
  it("retorna URL como primário e email como secundário", () => {
    const text = "Vagas: https://chat.whatsapp.com/abc\n📩 leticia@empresa.com.br";
    expect(extractAllContacts(text)).toEqual(["https://chat.whatsapp.com/abc", "leticia@empresa.com.br"]);
  });
  it("retorna duas URLs quando há dois links", () => {
    const text = "Apply: https://jobs.com/1 or https://jobs.com/2";
    expect(extractAllContacts(text)).toEqual(["https://jobs.com/1", "https://jobs.com/2"]);
  });
  it("retorna email como primário e vazio como secundário quando só há um email", () => {
    const text = "Envie para jobs@empresa.com";
    expect(extractAllContacts(text)).toEqual(["jobs@empresa.com", ""]);
  });
  it("retorna vazio para ambos quando não há contatos", () => {
    expect(extractAllContacts("Sem contato aqui")).toEqual(["", ""]);
  });
});

describe("extractPrimaryContact", () => {
  it("extrai URL com prioridade máxima", () => {
    const text = "Envie CV para jobs@empresa.com ou https://empresa.com/vagas";
    expect(extractPrimaryContact(text)).toBe("https://empresa.com/vagas");
  });
  it("extrai email quando não há URL", () => {
    const text = "Envie CV para jobs@empresa.com";
    expect(extractPrimaryContact(text)).toBe("jobs@empresa.com");
  });
  it("extrai telefone quando não há URL ou email", () => {
    const text = "Contato: (11) 99999-8888";
    expect(extractPrimaryContact(text)).toBe("(11) 99999-8888");
  });
  it("retorna string vazia se nenhum contato encontrado", () => {
    expect(extractPrimaryContact("Sem contato aqui")).toBe("");
  });
});

describe("detectInternational", () => {
  it("detecta inglês com múltiplos indicadores", () => {
    const text = "We are looking for a developer. Requirements: TypeScript. Benefits: remote work.";
    expect(detectInternational(text)).toBe("Sim");
  });
  it("retorna Não para texto em português", () => {
    const text = "Empresa brasileira busca desenvolvedor sênior. Requisitos: TypeScript.";
    expect(detectInternational(text)).toBe("Não");
  });
  it("retorna Não para texto com apenas um indicador de inglês", () => {
    const text = "Requirements: Node.js. Empresa brasileira.";
    expect(detectInternational(text)).toBe("Não");
  });
});

describe("detectLinkedIn", () => {
  it("detecta linkedin.com", () => {
    expect(detectLinkedIn("Aplique em https://linkedin.com/jobs/123")).toBe("Sim");
  });
  it("detecta menção ao LinkedIn", () => {
    expect(detectLinkedIn("Vaga publicada no LinkedIn")).toBe("Sim");
  });
  it("retorna Não quando não menciona", () => {
    expect(detectLinkedIn("Envie CV para jobs@empresa.com")).toBe("Não");
  });
});

describe("normalizeNewlines", () => {
  it("converte \\n literal em newline real", () => {
    expect(normalizeNewlines("Linha 1\\nLinha 2")).toBe("Linha 1\nLinha 2");
  });
  it("converte \\t literal em tab real", () => {
    expect(normalizeNewlines("Col 1\\tCol 2")).toBe("Col 1\tCol 2");
  });
  it("não altera texto sem escapes", () => {
    expect(normalizeNewlines("Texto normal")).toBe("Texto normal");
  });
});
