// ファイル編集ツール（検索＆置換）
import fs from 'fs/promises';
import { resolvePath, fileExists } from '../utils';
import type { ToolDefinition } from '../types';

export const editFileTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'edit_file',
            description: '既存ファイルの内容を部分的に編集する。指定した検索テキストを置換テキストに変更する。',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '編集するファイルのパス',
                    },
                    search: {
                        type: 'string',
                        description: '検索するテキスト（完全一致）',
                    },
                    replace: {
                        type: 'string',
                        description: '置換するテキスト',
                    },
                },
                required: ['path', 'search', 'replace'],
            },
        },
    },

    async execute(args) {
        const filePath = resolvePath(args.path as string);
        const search = args.search as string;
        const replace = args.replace as string;

        try {
            if (!(await fileExists(filePath))) {
                return { success: false, output: '', error: `ファイルが見つかりません: ${filePath}` };
            }

            const content = await fs.readFile(filePath, 'utf-8');

            if (!content.includes(search)) {
                return {
                    success: false,
                    output: '',
                    error: `検索テキストが見つかりません。ファイル内容と完全に一致するテキストを指定してください。`,
                };
            }

            // 出現回数を確認
            const occurrences = content.split(search).length - 1;
            const newContent = content.replace(search, replace);

            await fs.writeFile(filePath, newContent, 'utf-8');

            return {
                success: true,
                output: `ファイルを編集しました: ${filePath}\n置換箇所: ${occurrences}箇所中1箇所（最初の出現のみ）`,
            };
        } catch (err) {
            return { success: false, output: '', error: `ファイル編集エラー: ${(err as Error).message}` };
        }
    },
};
