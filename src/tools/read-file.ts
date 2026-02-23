// ファイル読み込みツール
import fs from 'fs/promises';
import { resolvePath, addLineNumbers, fileExists, formatBytes } from '../utils';
import type { ToolDefinition } from '../types';

export const readFileTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'ファイルの内容を読み込んで表示する。行番号の範囲指定も可能。',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '読み込むファイルのパス（絶対パスまたは相対パス）',
                    },
                    start_line: {
                        type: 'number',
                        description: '読み込み開始行（1始まり、省略時は先頭から）',
                    },
                    end_line: {
                        type: 'number',
                        description: '読み込み終了行（1始まり、省略時は末尾まで）',
                    },
                },
                required: ['path'],
            },
        },
    },

    async execute(args) {
        const filePath = resolvePath(args.path as string);
        const startLine = (args.start_line as number) || 1;
        const endLine = args.end_line as number | undefined;

        try {
            if (!(await fileExists(filePath))) {
                return { success: false, output: '', error: `ファイルが見つかりません: ${filePath}` };
            }

            const stat = await fs.stat(filePath);
            if (stat.isDirectory()) {
                return { success: false, output: '', error: `指定されたパスはディレクトリです: ${filePath}` };
            }

            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            const totalLines = lines.length;

            const start = Math.max(1, startLine);
            const end = endLine ? Math.min(endLine, totalLines) : totalLines;
            const selectedLines = lines.slice(start - 1, end);

            const numberedContent = addLineNumbers(selectedLines.join('\n'), start);

            return {
                success: true,
                output: `ファイル: ${filePath}\nサイズ: ${formatBytes(stat.size)} | 総行数: ${totalLines} | 表示: ${start}-${end}行\n\n${numberedContent}`,
            };
        } catch (err) {
            return { success: false, output: '', error: `ファイル読み込みエラー: ${(err as Error).message}` };
        }
    },
};
