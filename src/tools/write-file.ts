// ファイル書き込みツール
import fs from 'fs/promises';
import path from 'path';
import { resolvePath, fileExists } from '../utils';
import type { ToolDefinition } from '../types';

export const writeFileTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'ファイルに内容を書き込む。ファイルが存在しない場合は新規作成する。親ディレクトリも自動作成される。',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '書き込み先のファイルパス（絶対パスまたは相対パス）',
                    },
                    content: {
                        type: 'string',
                        description: 'ファイルに書き込む内容',
                    },
                },
                required: ['path', 'content'],
            },
        },
    },

    async execute(args) {
        const filePath = resolvePath(args.path as string);
        const content = args.content as string;

        try {
            // 親ディレクトリを自動作成
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });

            const existed = await fileExists(filePath);
            await fs.writeFile(filePath, content, 'utf-8');

            const action = existed ? '上書き' : '新規作成';
            const lines = content.split('\n').length;

            return {
                success: true,
                output: `ファイルを${action}しました: ${filePath}\n行数: ${lines}`,
            };
        } catch (err) {
            return { success: false, output: '', error: `ファイル書き込みエラー: ${(err as Error).message}` };
        }
    },
};
