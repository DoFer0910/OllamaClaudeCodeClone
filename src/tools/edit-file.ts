// ファイル編集ツール（検索＆置換） — ユーザー承認付き
import fs from 'fs/promises';
import chalk from 'chalk';
import { resolvePath, fileExists } from '../utils';
import { confirmAction, isProtectedPath, isOutsideProject, type DangerLevel } from '../confirm';
import type { ToolDefinition } from '../types';

export const editFileTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'edit_file',
            description: '既存ファイルの内容を部分的に編集する。指定した検索テキストを置換テキストに変更する。実行前にユーザーの承認を求める。',
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
            // システム保護パスへの編集をブロック
            if (isProtectedPath(filePath)) {
                return {
                    success: false,
                    output: '',
                    error: `セキュリティエラー: システム保護領域のファイル編集はブロックされています: ${filePath}`,
                };
            }

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

            // 危険度の決定
            let level: DangerLevel = 'medium';
            let warnings: string[] = [];

            if (isOutsideProject(filePath)) {
                level = 'high';
                warnings.push('⚠ プロジェクト外のファイルです');
            }

            // 変更差分のプレビューを作成
            const searchPreview = search.length > 100 ? search.substring(0, 100) + '...' : search;
            const replacePreview = replace.length > 100 ? replace.substring(0, 100) + '...' : replace;

            const details = [
                `ファイル: ${filePath}`,
                `置換箇所: ${occurrences}箇所中1箇所（最初の出現）`,
                ``,
                `${chalk.red('- ' + searchPreview.split('\n').join('\n  - '))}`,
                `${chalk.green('+ ' + replacePreview.split('\n').join('\n  + '))}`,
                ...warnings.map(w => `  ${w}`),
            ].join('\n  ');

            // ユーザー承認を求める
            const approved = await confirmAction({
                description: 'ファイルを編集します',
                details,
                level,
            });

            if (!approved) {
                return {
                    success: false,
                    output: '',
                    error: 'ユーザーによりファイル編集がキャンセルされました',
                };
            }

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
