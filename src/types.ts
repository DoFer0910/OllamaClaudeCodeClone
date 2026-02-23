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
    // v1.0 新規設定
    autoApprove: boolean;        // -y フラグ: 全操作を自動承認
    prompt: string | null;       // -p フラグ: ワンショットモード
    sessionId: string | null;    // --session-id: セッションID指定
    resume: boolean;             // --resume: 最新セッションを再開
    debug: boolean;              // --debug: デバッグログ出力
    temperature: number;         // --temperature: LLMの温度パラメータ
    contextWindow: number;       // --context-window: コンテキストウィンドウサイズ
    maxTokens: number;           // --max-tokens: 最大出力トークン数
}

// デフォルト設定
export const DEFAULT_CONFIG: AppConfig = {
    model: 'qwen3-coder:30b',
    host: 'http://localhost:11434',
    systemPrompt: '',
    maxContextTokens: 32768,
    autoApprove: false,
    prompt: null,
    sessionId: null,
    resume: false,
    debug: false,
    temperature: 0.7,
    contextWindow: 32768,
    maxTokens: 8192,
};

// セッションデータの型
export interface SessionData {
    id: string;
    createdAt: string;
    updatedAt: string;
    model: string;
    cwd: string;
    messages: Message[];
}

// モデルTier情報の型
export interface ModelTier {
    name: string;
    tier: 'S' | 'A' | 'B' | 'C';
    minRamGB: number;
}

// タスク情報の型
export interface TaskInfo {
    id: string;
    title: string;
    status: 'pending' | 'in_progress' | 'done';
    description: string;
    createdAt: string;
    updatedAt: string;
}

// Plan/Actモードの状態
export type PlanActMode = 'normal' | 'plan' | 'act';

// ファイル変更の種類
export type FileChangeType = 'created' | 'modified' | 'deleted';

// ファイル変更情報
export interface FileChange {
    path: string;
    type: FileChangeType;
    timestamp: number;
}

// MCPサーバー設定
export interface MCPServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

// MCP設定ファイルの型
export interface MCPConfig {
    mcpServers: Record<string, MCPServerConfig>;
}

// メッセージ型の再エクスポート
export type { Message, Tool };
