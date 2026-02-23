// ファイル書き込みツール — ユーザー承認付き
import fs from 'fs/promises';
import path from 'path';
import { resolvePath, fileExists } from '../utils';
import { confirmAction, isProtectedPath, isOutsideProject, type DangerLevel } from '../confirm';
import type { ToolDefinition } from '../types';

export const writeFileTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'ファイルに内容を書き込む。ファイルが存在しない場合は新規作成する。親ディレクトリも自動作成される。実行前にユーザーの承認を求める。',
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
            // システム保護パスへの書き込みをブロック
            if (isProtectedPath(filePath)) {
                return {
                    success: false,
                    output: '',
                    error: `セキュリティエラー: システム保護領域への書き込みはブロックされています: ${filePath}`,
                };
            }

            const existed = await fileExists(filePath);
            const lines = content.split('\n').length;

            // 危険度の決定
            let level: DangerLevel = 'low';
            let warnings: string[] = [];

            if (isOutsideProject(filePath)) {
                level = 'high';
                warnings.push('⚠ プロジェクト外のファイルです');
            }
            if (existed) {
                level = level === 'high' ? 'high' : 'medium';
                warnings.push('既存ファイルを上書きします');
            }

            const action = existed ? '上書き' : '新規作成';
            const details = [
                `ファイル: ${filePath}`,
                `操作: ${action} (${lines}行)`,
                ...warnings.map(w => `  ${w}`),
            ].join('\n  ');

            // ユーザー承認を求める
            const approved = await confirmAction({
                description: `ファイルを${action}します`,
                details,
                level,
            });

            if (!approved) {
                return {
                    success: false,
                    output: '',
                    error: 'ユーザーによりファイル書き込みがキャンセルされました',
                };
            }

            // 親ディレクトリを自動作成
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(filePath, content, 'utf-8');

            return {
                success: true,
                output: `ファイルを${action}しました: ${filePath}\n行数: ${lines}`,
            };
        } catch (err) {
            return { success: false, output: '', error: `ファイル書き込みエラー: ${(err as Error).message}` };
        }
    },
};
