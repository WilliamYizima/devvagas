import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

export interface SkillMeta {
  name: string;
  description: string;
}

export interface Skill extends SkillMeta {
  content: string;
}

export class SkillLoader {
  private readonly skillsDir: string;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir ?? process.env.SKILLS_DIR ?? './.agents/skills';
  }

  load(): Skill[] {
    if (!fs.existsSync(this.skillsDir)) return [];

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    const skills: Skill[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillFile = path.join(this.skillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;

      try {
        const rawContent = fs.readFileSync(skillFile, 'utf-8');
        const skill = this.parseSkillFile(rawContent);
        if (skill) skills.push(skill);
      } catch {
        console.warn(`[SkillLoader] Skipped malformed skill in: ${entry.name}`);
      }
    }

    return skills;
  }

  private parseSkillFile(raw: string): Skill | null {
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!frontmatterMatch) return null;

    const [, frontmatterStr, bodyContent] = frontmatterMatch;

    let meta: Record<string, unknown>;
    try {
      meta = yaml.load(frontmatterStr) as Record<string, unknown>;
    } catch {
      return null;
    }

    const name = meta['name'] as string | undefined;
    const description = meta['description'] as string | undefined;
    if (!name || !description) return null;

    return { name, description, content: bodyContent.trim() };
  }
}
