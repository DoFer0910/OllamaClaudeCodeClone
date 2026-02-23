// ディレクトリ一覧ツール
import fs from 'fs/promises';
import path from 'path';
import { resolvePath, formatBytes } from '../utils';
import type { ToolDefinition } from '../types';

// 無視するディレクトリ
const IGNORE_DIRS = new Set([
    'node_modules', '.git', '.svn', '.hg',
]);

export const listDirectoryTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'list_directory',
            description: 'ディレクトリの内容を一覧表示する。ファイルとサブディレクトリをサイズ情報付きで表示する。',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '一覧表示するディレクトリのパス（省略時はカレントディレクトリ）',
                    },
                    depth: {
                        type: 'number',
                        description: '表示する深さ（デフォルト: 1、最大: 3）',
                    },
                },
                required: [],
            },
        },
    },

    async execute(args) {
        const dirPath = resolvePath((args.path as string) || process.cwd());
        const maxDepth = Math.min((args.depth as number) || 1, 3);

        try {
            const stat = await fs.stat(dirPath);
            if (!stat.isDirectory()) {
                return { success: false, output: '', error: `指定されたパスはディレクトリではありません: ${dirPath}` };
            }

            const lines: string[] = [`📁 ${dirPath}`];
            await listRecursive(dirPath, lines, 0, maxDepth);

            return { success: true, output: lines.join('\n') };
        } catch (err) {
            return { success: false, output: '', error: `ディレクトリ一覧エラー: ${(err as Error).message}` };
        }
    },
};

async function listRecursive(
    dir: string,
    lines: string[],
    depth: number,
    maxDepth: number
): Promise<void> {
    if (depth >= maxDepth) return;

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const indent = '  '.repeat(depth + 1);

        // ディレクトリとファイルをソート
        const dirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
        const files = entries.filter((e) => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));

        // ディレクトリを先に表示
        for (const d of dirs) {
            if (IGNORE_DIRS.has(d.name)) {
                lines.push(`${indent}📁 ${d.name}/ (スキップ)`);
                continue;
            }
            lines.push(`${indent}📁 ${d.name}/`);
            await listRecursive(path.join(dir, d.name), lines, depth + 1, maxDepth);
        }

        // ファイルを表示
        for (const f of files) {
            try {
                const fileStat = await fs.stat(path.join(dir, f.name));
                lines.push(`${indent}📄 ${f.name} (${formatBytes(fileStat.size)})`);
            } catch {
                lines.push(`${indent}📄 ${f.name}`);
            }
        }
    } catch {
        lines.push(`${'  '.repeat(depth + 1)}(アクセスできません)`);
    }
}
