// 共通ユーティリティ関数
import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';

// パスを正規化し、絶対パスに変換する
export function resolvePath(inputPath: string): string {
    if (path.isAbsolute(inputPath)) {
        return path.normalize(inputPath);
    }
    return path.resolve(process.cwd(), inputPath);
}

// ファイルが存在するか確認する
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// ツール実行のログ表示
export function logToolCall(toolName: string, args: Record<string, unknown>): void {
    const argsStr = Object.entries(args)
        .map(([k, v]) => `${k}=${typeof v === 'string' && v.length > 80 ? v.substring(0, 80) + '...' : v}`)
        .join(', ');
    console.log(chalk.dim(`  ⚡ ${toolName}(${argsStr})`));
}

// ツール結果のログ表示
export function logToolResult(success: boolean, message: string): void {
    if (success) {
        console.log(chalk.dim(`  ✓ ${message}`));
    } else {
        console.log(chalk.red(`  ✗ ${message}`));
    }
}

// テキストを行番号付きで表示する
export function addLineNumbers(text: string, startLine: number = 1): string {
    const lines = text.split('\n');
    const maxLineNum = startLine + lines.length - 1;
    const padding = String(maxLineNum).length;
    return lines
        .map((line, i) => `${String(startLine + i).padStart(padding)} │ ${line}`)
        .join('\n');
}

// バイト数を人間が読みやすい形式に変換する
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// 文字列を安全に切り詰める
export function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
}
