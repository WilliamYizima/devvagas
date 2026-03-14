import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './BaseTool';

export class CreateFileTool extends BaseTool {
  readonly name = 'create_file';
  readonly description =
    'Creates a file at the given path with the specified content. Use this to persist documents, specs, code, or any text output to disk.';
  readonly parameters = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Relative or absolute path where the file should be created.',
      },
      content: {
        type: 'string',
        description: 'Full text content to write to the file.',
      },
    },
    required: ['file_path', 'content'],
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const filePath = args['file_path'] as string;
    const content = args['content'] as string;

    if (!filePath || typeof filePath !== 'string') {
      throw new Error('file_path must be a non-empty string');
    }

    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');

    return `File created successfully at: ${filePath}`;
  }
}
