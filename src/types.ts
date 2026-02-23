// 共通型定義
import { type Tool, type Message } from 'ollama';

// ツール実行結果の型
export interface ToolResult {
    success: boolean;
    output: string;
    error?: string;
}

// ツール定義の型
export interface ToolDefinition {
    // Ollama API に渡すツール定義
    definition: Tool;
    // ツールの実行関数
    execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

// CLI設定の型
export interface AppConfig {
    model: string;
    host: string;
    systemPrompt: string;
    maxContextTokens: number;
}

// デフォルト設定
export const DEFAULT_CONFIG: AppConfig = {
    model: 'qwen3-coder:30b',
    host: 'http://localhost:11434',
    systemPrompt: '',
    maxContextTokens: 32768,
};

// メッセージ型の再エクスポート
export type { Message, Tool };
