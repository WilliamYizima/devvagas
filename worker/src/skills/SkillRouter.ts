import { ILLMProvider } from '../providers/ILLMProvider';
import { SkillMeta } from './SkillLoader';

export class SkillRouter {
  constructor(private readonly provider: ILLMProvider) {}

  async route(userMessage: string, availableSkills: SkillMeta[]): Promise<string | null> {
    if (availableSkills.length === 0) return null;

    const skillList = availableSkills.map((s) => `- ${s.name}: ${s.description}`).join('\n');

    // Truncate to avoid confusing the LLM with very long vacancy texts.
    // Routing only needs the user's intent, not the full body of content.
    const preview = userMessage.length > 300
      ? userMessage.slice(0, 300) + '…'
      : userMessage;

    const prompt = `You are a routing assistant. Based on the user message, decide which skill to activate.
Available skills:
${skillList}

User message: "${preview}"

Respond with ONLY valid JSON in this exact format, with no extra text:
{"skillName": "<skill-name>" or null}

Return null if no skill matches or if this is casual conversation.`;

    try {
      const response = await this.provider.chat([{ role: 'user', content: prompt }]);
      const raw = response.content?.trim() ?? '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as { skillName?: string | null };
      return parsed.skillName ?? null;
    } catch {
      console.warn('[SkillRouter] Failed to parse routing response, defaulting to null');
      return null;
    }
  }
}
