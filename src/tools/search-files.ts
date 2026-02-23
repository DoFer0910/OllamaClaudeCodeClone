// ファイル検索ツール（ファイル名で検索）
import fs from 'fs/promises';
import path from 'path';
import { resolvePath } from '../utils';
import type { ToolDefinition } from '../types';

// 無視するディレクトリ
const IGNORE_DIRS = new Set([
    'node_modules', '.git', '.svn', '.hg', 'dist', 'build',
    '__pycache__', '.cache', '.next', '.nuxt', 'coverage',
    '.venv', 'venv', 'env', '.env',
]);

// 検索結果の最大数
const MAX_RESULTS = 50;

async function searchRecursive(
    dir: string,
    pattern: string,
    results: string[],
    depth: number = 0,
    maxDepth: number = 10
): Promise<void> {
    if (depth > maxDepth || results.length >= MAX_RESULTS) return;

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (results.length >= MAX_RESULTS) break;

            if (entry.isDirectory()) {
                if (IGNORE_DIRS.has(entry.name)) continue;
                await searchRecursive(path.join(dir, entry.name), pattern, results, depth + 1, maxDepth);
            } else {
                // glob風のパターンマッチ（簡易版）
                const matchPattern = pattern
                    .replace(/\./g, '\\.')
                    .replace(/\*/g, '.*')
                    .replace(/\?/g, '.');
                const regex = new RegExp(matchPattern, 'i');
                if (regex.test(entry.name)) {
                    results.push(path.join(dir, entry.name));
                }
            }
        }
    } catch {
        // ディレクトリにアクセスできない場合はスキップ
    }
}

export const searchFilesTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'search_files',
            description: 'ファイル名のパターンでプロジェクト内のファイルを検索する。globパターン（* や ?）が使用可能。',
            parameters: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'ファイル名の検索パターン（例: "*.ts", "index.*", "config*"）',
                    },
                    directory: {
                        type: 'string',
                        description: '検索するディレクトリ（省略時はカレントディレクトリ）',
                    },
                },
                required: ['pattern'],
            },
        },
    },

    async execute(args) {
        const pattern = args.pattern as string;
        const directory = resolvePath((args.directory as string) || process.cwd());

        try {
            const results: string[] = [];
            await searchRecursive(directory, pattern, results);

            if (results.length === 0) {
                return { success: true, output: `パターン "${pattern}" に一致するファイルは見つかりませんでした。` };
            }

            // カレントディレクトリからの相対パスに変換
            const relativePaths = results.map((r) => path.relative(directory, r));
            const output = [
                `検索パターン: "${pattern}"`,
                `ディレクトリ: ${directory}`,
                `結果: ${results.length}件${results.length >= MAX_RESULTS ? '（上限に達しました）' : ''}`,
                '',
                ...relativePaths,
            ].join('\n');

            return { success: true, output };
        } catch (err) {
            return { success: false, output: '', error: `ファイル検索エラー: ${(err as Error).message}` };
        }
    },
};
