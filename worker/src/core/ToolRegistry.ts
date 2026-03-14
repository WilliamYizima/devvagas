import { BaseTool } from '../tools/BaseTool';
import { ToolDefinition } from '../providers/ILLMProvider';

export class ToolRegistry {
  private readonly tools = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.toDefinition());
  }

  getAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }
}
