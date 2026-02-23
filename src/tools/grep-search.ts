// コード検索ツール（ファイル内容の全文検索）
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

// バイナリ拡張子（検索対象外）
const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.zip', '.gz', '.tar', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.mp3', '.mp4', '.avi', '.mov', '.wav',
]);

// 検索結果の最大数
const MAX_RESULTS = 50;

interface GrepMatch {
    file: string;
    line: number;
    content: string;
}

async function grepRecursive(
    dir: string,
    query: string,
    isRegex: boolean,
    results: GrepMatch[],
    depth: number = 0,
    maxDepth: number = 10
): Promise<void> {
    if (depth > maxDepth || results.length >= MAX_RESULTS) return;

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (results.length >= MAX_RESULTS) break;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (IGNORE_DIRS.has(entry.name)) continue;
                await grepRecursive(fullPath, query, isRegex, results, depth + 1, maxDepth);
            } else {
                // バイナリファイルはスキップ
                const ext = path.extname(entry.name).toLowerCase();
                if (BINARY_EXTENSIONS.has(ext)) continue;

                try {
                    const content = await fs.readFile(fullPath, 'utf-8');
                    const lines = content.split('\n');
                    const regex = isRegex ? new RegExp(query, 'gi') : null;

                    for (let i = 0; i < lines.length; i++) {
                        if (results.length >= MAX_RESULTS) break;

                        const match = isRegex
                            ? regex!.test(lines[i])
                            : lines[i].includes(query);

                        if (match) {
                            results.push({
                                file: fullPath,
                                line: i + 1,
                                content: lines[i].trim(),
                            });
                        }

                        // 正規表現のlastIndexをリセット
                        if (regex) regex.lastIndex = 0;
                    }
                } catch {
                    // ファイル読み込みエラーはスキップ
                }
            }
        }
    } catch {
        // ディレクトリアクセスエラーはスキップ
    }
}

export const grepSearchTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'grep_search',
            description: 'ファイルの内容を検索する。テキストまたは正規表現パターンでの検索が可能。',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: '検索するテキストまたは正規表現パターン',
                    },
                    directory: {
                        type: 'string',
                        description: '検索対象のディレクトリ（省略時はカレントディレクトリ）',
                    },
                    is_regex: {
                        type: 'boolean',
                        description: '正規表現として検索するかどうか（デフォルト: false）',
                    },
                },
                required: ['query'],
            },
        },
    },

    async execute(args) {
        const query = args.query as string;
        const directory = resolvePath((args.directory as string) || process.cwd());
        const isRegex = (args.is_regex as boolean) || false;

        try {
            // 正規表現の妥当性チェック
            if (isRegex) {
                try {
                    new RegExp(query);
                } catch (e) {
                    return { success: false, output: '', error: `無効な正規表現: ${(e as Error).message}` };
                }
            }

            const results: GrepMatch[] = [];
            await grepRecursive(directory, query, isRegex, results);

            if (results.length === 0) {
                return { success: true, output: `"${query}" に一致する結果は見つかりませんでした。` };
            }

            // 結果をファイルごとにグループ化
            const grouped = new Map<string, GrepMatch[]>();
            for (const match of results) {
                const rel = path.relative(directory, match.file);
                if (!grouped.has(rel)) grouped.set(rel, []);
                grouped.get(rel)!.push(match);
            }

            const outputLines: string[] = [
                `検索: "${query}" ${isRegex ? '(正規表現)' : ''}`,
                `結果: ${results.length}件${results.length >= MAX_RESULTS ? '（上限に達しました）' : ''}`,
                '',
            ];

            for (const [file, matches] of grouped) {
                outputLines.push(`📄 ${file}`);
                for (const m of matches) {
                    const trimmed = m.content.length > 120 ? m.content.substring(0, 120) + '...' : m.content;
                    outputLines.push(`  L${m.line}: ${trimmed}`);
                }
                outputLines.push('');
            }

            return { success: true, output: outputLines.join('\n') };
        } catch (err) {
            return { success: false, output: '', error: `コード検索エラー: ${(err as Error).message}` };
        }
    },
};
