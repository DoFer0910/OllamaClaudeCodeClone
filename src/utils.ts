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

// ツール呼び出しのパース結果の型
export interface ParsedToolCall {
    name: string;
    arguments: Record<string, unknown>;
}

// テキスト本文からツール呼び出しJSONを検出するフォールバックパーサー
// モデルが tool_calls フィールドではなくテキストにJSONを出力した場合に使用
export function parseToolCallsFromText(text: string): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    if (!text || text.trim().length === 0) return results;

    // パターン1: ```json ... ``` コードブロック内のJSON
    const codeBlockPattern = /```(?:json)?\s*\n?([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

    while ((match = codeBlockPattern.exec(text)) !== null) {
        const parsed = tryParseToolCall(match[1].trim());
        if (parsed) results.push(parsed);
    }

    // コードブロックで見つかったら、それを優先
    if (results.length > 0) return results;

    // パターン2: ブレースバランシングでJSONオブジェクトを正確に切り出す
    const jsonObjects = extractBalancedJsonObjects(text);
    for (const jsonStr of jsonObjects) {
        const parsed = tryParseToolCall(jsonStr);
        if (parsed) results.push(parsed);
    }

    return results;
}

// テキストからブレースバランシングでJSONオブジェクトを抽出する
// 文字列リテラル内の { } やエスケープ文字を正しく処理する
function extractBalancedJsonObjects(text: string): string[] {
    const results: string[] = [];
    let i = 0;

    while (i < text.length) {
        if (text[i] === '{') {
            // ブレースバランシングでオブジェクト全体を切り出す
            const start = i;
            let depth = 0;
            let inString = false;
            let escaped = false;

            for (let j = i; j < text.length; j++) {
                const ch = text[j];

                if (escaped) {
                    // エスケープされた文字はスキップ
                    escaped = false;
                    continue;
                }

                if (ch === '\\' && inString) {
                    // 次の文字をエスケープとして扱う
                    escaped = true;
                    continue;
                }

                if (ch === '"') {
                    inString = !inString;
                    continue;
                }

                if (inString) continue;

                if (ch === '{') {
                    depth++;
                } else if (ch === '}') {
                    depth--;
                    if (depth === 0) {
                        const candidate = text.substring(start, j + 1);
                        // ツール呼び出しに関連するキーが含まれているか簡易チェック
                        if (candidate.includes('"name"') && candidate.includes('"arguments"')) {
                            results.push(candidate);
                        }
                        i = j + 1;
                        break;
                    }
                }

                if (j === text.length - 1) {
                    // 閉じブレースが見つからなかった
                    i = start + 1;
                }
            }

            if (depth !== 0) {
                i = start + 1;
            }
        } else {
            i++;
        }
    }

    return results;
}

// 単一のJSONテキストをツール呼び出しとしてパースする
function tryParseToolCall(jsonStr: string): ParsedToolCall | null {
    try {
        const obj = JSON.parse(jsonStr);

        // パターンA: {"name": "tool_name", "arguments": {...}}
        if (obj.name && typeof obj.name === 'string' && obj.arguments && typeof obj.arguments === 'object') {
            return { name: obj.name, arguments: obj.arguments };
        }

        // パターンB: {"function": {"name": "tool_name", "arguments": {...}}}
        if (obj.function?.name && obj.function?.arguments) {
            return { name: obj.function.name, arguments: obj.function.arguments };
        }

        return null;
    } catch {
        return null;
    }
}
