import { SupervisorRule } from "../../lib/supervisor/ISupervisor";

export const VACANCY_SUPERVISOR_RULES: SupervisorRule[] = [
  {
    field: "nivel",
    rule: "Deve ser exatamente um dos 6 valores do enum. NUNCA valores combinados com '/' ou 'e'.",
    example: "ERRADO: 'Pleno/Sênior'. CORRETO: 'Sênior' (use o mais alto)."
  },
  {
    field: "area",
    rule: "Deve ser 'Dev' ou 'Business'. Use 'Indefinido' somente se genuinamente impossível classificar. Cargos técnicos são sempre 'Dev'.",
    example: "Data Scientist → 'Dev'. Product Manager de negócios → 'Business'."
  },
  {
    field: "vaga",
    rule: "Não deve conter emojis, 'VAGA:', localidade, nome da empresa ou nível de senioridade.",
    example: "ERRADO: '🚀 Dev Sênior - SP'. CORRETO: 'Dev Sênior'."
  },
  {
    field: "stack",
    rule: "Deve ter valor. Nunca string vazia. Use 'Indefinido' se nenhuma tecnologia mencionada.",
  },
  {
    field: "aplicar",
    rule: "Deve conter exatamente UM contato primário. Não pode estar vazio.",
  },
  {
    field: "descricao",
    rule: "Deve conter '#### Principais Atividades' e '#### Requisitos Técnicos'. Atividades = tarefas do cargo (verbos: desenvolver, implementar, liderar). Requisitos = qualificações exigidas (anos de experiência, fluência, certificações). Se um item de requisito estiver em Atividades (ex: 'X anos de experiência'), mova-o para Requisitos. Se uma tarefa estiver em Requisitos, mova-a para Atividades. ALÉM DISSO: se 'descricao' não contém nenhuma instrução de candidatura (palavras-chave: 'interessados', 'encaminhar', 'candidate-se', 'candidatar', 'enviar currículo', 'para se candidatar') mas 'aplicar' está preenchido, adicione ao final de 'descricao' a linha: '\\n\\nPara se candidatar: [valor do campo aplicar]'.",
    example: "ERRADO em Atividades: '+3 anos de experiência com Java'. CORRETO em Requisitos: '+3 anos de experiência com Java'. Exemplo de instrução adicionada ao final: 'Para se candidatar: (11) 99195-0357'.",
  },
  {
    field: "empresa",
    rule: "Nunca pode estar vazio. Use 'Empresa indefinida' se não identificada.",
  }
];
