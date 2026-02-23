// ファイル編集ツール（検索＆置換） — リッチdiff表示 + 複数箇所対応 + ユーザー承認付き
import fs from 'fs/promises';
import chalk from 'chalk';
import { resolvePath, fileExists } from '../utils';
import { confirmAction, isProtectedPath, isOutsideProject, type DangerLevel } from '../confirm';
import { createCheckpoint } from '../git-checkpoint';
import type { ToolDefinition } from '../types';

// unified diff形式の差分を生成する
function generateUnifiedDiff(filePath: string, oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    const diff: string[] = [];
    diff.push(chalk.bold(`--- a/${filePath}`));
    diff.push(chalk.bold(`+++ b/${filePath}`));

    // 簡易diff（変更箇所を検出）
    const maxLen = Math.max(oldLines.length, newLines.length);
    let chunkStart = -1;
    let chunkOld: string[] = [];
    let chunkNew: string[] = [];

    for (let i = 0; i <= maxLen; i++) {
        const oldLine = i < oldLines.length ? oldLines[i] : undefined;
        const newLine = i < newLines.length ? newLines[i] : undefined;

        if (oldLine !== newLine) {
            if (chunkStart === -1) chunkStart = i;
            if (oldLine !== undefined) chunkOld.push(oldLine);
            if (newLine !== undefined) chunkNew.push(newLine);
        } else {
            if (chunkStart !== -1) {
                // チャンクを出力
                diff.push(chalk.cyan(`@@ -${chunkStart + 1},${chunkOld.length} +${chunkStart + 1},${chunkNew.length} @@`));
                for (const line of chunkOld) {
                    diff.push(chalk.red(`- ${line}`));
                }
                for (const line of chunkNew) {
                    diff.push(chalk.green(`+ ${line}`));
                }
                chunkStart = -1;
                chunkOld = [];
                chunkNew = [];
            }
        }
    }

    // 最後のチャンク
    if (chunkStart !== -1) {
        diff.push(chalk.cyan(`@@ -${chunkStart + 1},${chunkOld.length} +${chunkStart + 1},${chunkNew.length} @@`));
        for (const line of chunkOld) {
            diff.push(chalk.red(`- ${line}`));
        }
        for (const line of chunkNew) {
            diff.push(chalk.green(`+ ${line}`));
        }
    }

    return diff.join('\n');
}

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
                    replaceAll: {
                        type: 'boolean',
                        description: 'trueの場合、すべての出現箇所を置換する（デフォルト: false で最初の1箇所のみ）',
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
        const replaceAll = (args.replaceAll as boolean) || false;

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

            // 新しいコンテンツを生成
            const newContent = replaceAll
                ? content.split(search).join(replace)
                : content.replace(search, replace);

            // リッチdiff表示
            const diffText = generateUnifiedDiff(
                filePath.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', ''),
                content,
                newContent
            );

            // 危険度の決定
            let level: DangerLevel = 'medium';
            let warnings: string[] = [];

            if (isOutsideProject(filePath)) {
                level = 'high';
                warnings.push('⚠ プロジェクト外のファイルです');
            }

            const replaceCount = replaceAll ? occurrences : 1;
            const details = [
                `ファイル: ${filePath}`,
                `置換箇所: ${occurrences}箇所中${replaceCount}箇所`,
                '',
                diffText,
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

            // Gitチェックポイントを作成（編集前）
            createCheckpoint(`edit: ${filePath}`);

            await fs.writeFile(filePath, newContent, 'utf-8');

            return {
                success: true,
                output: `ファイルを編集しました: ${filePath}\n置換箇所: ${occurrences}箇所中${replaceCount}箇所`,
            };
        } catch (err) {
            return { success: false, output: '', error: `ファイル編集エラー: ${(err as Error).message}` };
        }
    },
};
