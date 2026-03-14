import { Skill } from './SkillLoader';

export interface SkillContext {
  systemPrompt: string;
  skillName: string | null;
}

export class SkillExecutor {
  buildContext(skill: Skill | null): SkillContext {
    if (!skill) {
      return { skillName: null, systemPrompt: this.defaultSystemPrompt() };
    }

    return {
      skillName: skill.name,
      systemPrompt: `${skill.content}\n\n${this.baseInstructions()}`,
    };
  }

  private defaultSystemPrompt(): string {
    return `You are Boro, a personal AI assistant running locally on the user's desktop.
You are helpful, concise, and accurate.
When creating documents or files, use the create_file tool.
If the user asks for a document as a file, mark your response with [ARQUIVO:filename.md] at the very beginning.

${this.baseInstructions()}`;
  }

  private baseInstructions(): string {
    return `IMPORTANT RULES:
- Always respond in the same language the user uses (default: Portuguese BR).
- When creating structured documents (PRD, specs, reports), wrap the full content and save it as a file using create_file tool.
- When a skill instructs you to call a tool, do it — do not skip tool calls by returning the data as text.
- Be direct and objective in your responses.`;
  }
}
