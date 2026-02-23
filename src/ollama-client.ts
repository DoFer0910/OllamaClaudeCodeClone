// Ollama クライアント — API通信とエージェントループの管理（v1.0強化版）
import { Ollama } from 'ollama';
import type { Message } from './types';
import { getToolDefinitions, executeTool } from './tools/index';
import { parseToolCallsFromText, parseXmlToolCalls } from './utils';
import chalk from 'chalk';

// エージェントループの最大反復回数（無限ループ防止）
const MAX_TOOL_ITERATIONS = 25;

// ツール呼び出し情報の型
interface ToolCallInfo {
    function: {
        name: string;
        arguments: Record<string, unknown>;
    };
}

// モデルTier定義（RAM基準で自動選択）
const MODEL_TIERS = [
    { name: 'deepseek-r1:671b', tier: 'S' as const, minRamGB: 384 },
    { name: 'qwen3:235b', tier: 'S' as const, minRamGB: 256 },
    { name: 'llama3.1:405b', tier: 'S' as const, minRamGB: 256 },
    { name: 'llama3.3:70b', tier: 'A' as const, minRamGB: 48 },
    { name: 'qwen3-coder:30b', tier: 'A' as const, minRamGB: 20 },
    { name: 'qwen2.5-coder:32b', tier: 'A' as const, minRamGB: 20 },
    { name: 'qwen3:8b', tier: 'B' as const, minRamGB: 8 },
    { name: 'llama3.1:8b', tier: 'B' as const, minRamGB: 8 },
    { name: 'qwen3:1.7b', tier: 'C' as const, minRamGB: 4 },
    { name: 'llama3.2:3b', tier: 'C' as const, minRamGB: 4 },
];

export class OllamaClient {
    private client: Ollama;
    private model: string;
    private temperature: number;
    private maxTokens: number;
    private debug: boolean;

    constructor(host: string, model: string, options?: { temperature?: number; maxTokens?: number; debug?: boolean }) {
        this.client = new Ollama({ host });
        this.model = model;
        this.temperature = options?.temperature ?? 0.7;
        this.maxTokens = options?.maxTokens ?? 8192;
        this.debug = options?.debug ?? false;
    }

    // モデルを変更する
    setModel(model: string): void {
        this.model = model;
    }

    // 現在のモデル名を取得
    getModel(): string {
        return this.model;
    }

    // Ollamaサーバーへの接続を確認する
    async checkConnection(): Promise<boolean> {
        try {
            await this.client.list();
            return true;
        } catch {
            return false;
        }
    }

    // 利用可能なモデル一覧を取得する
    async listModels(): Promise<string[]> {
        try {
            const response = await this.client.list();
            return response.models.map((m) => m.name);
        } catch {
            return [];
        }
    }

    // インストール済みモデルからTier情報付きで一覧を取得する
    async listModelsWithTiers(): Promise<{ name: string; tier: string; installed: boolean }[]> {
        const installed = await this.listModels();
        const installedSet = new Set(installed.map(m => m.split(':')[0]));

        return MODEL_TIERS.map(t => ({
            name: t.name,
            tier: t.tier,
            installed: installedSet.has(t.name.split(':')[0]),
        }));
    }

    // 利用可能な最良のモデルを自動選択する
    async autoSelectModel(): Promise<string | null> {
        const installed = await this.listModels();
        if (installed.length === 0) return null;

        // インストール済みモデルのうち、Tier順で最良のものを選択
        for (const tier of MODEL_TIERS) {
            const modelBase = tier.name.split(':')[0];
            const found = installed.find(m => m.startsWith(modelBase));
            if (found) return found;
        }

        // Tierに含まれないモデルがあればそれを使用
        return installed[0];
    }

    // サブエージェント用の簡易チャット（ツールなし）
    async simpleChat(prompt: string, systemPrompt?: string): Promise<string> {
        const messages: Message[] = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        try {
            const response = await this.client.chat({
                model: this.model,
                messages,
                stream: false,
                options: {
                    temperature: this.temperature,
                    num_predict: this.maxTokens,
                },
            });
            return response.message?.content || '';
        } catch (err) {
            return `エラー: ${(err as Error).message}`;
        }
    }

    // 非ストリーミングチャット + ツール呼び出しのエージェントループ
    async chat(
        messages: Message[],
        onToken: (token: string) => void,
        onToolCall?: (name: string) => void
    ): Promise<Message> {
        const tools = getToolDefinitions();
        let iteration = 0;
        let currentMessages = [...messages];

        while (iteration < MAX_TOOL_ITERATIONS) {
            iteration++;

            let fullContent = '';
            let toolCalls: ToolCallInfo[] = [];

            try {
                const response = await this.client.chat({
                    model: this.model,
                    messages: currentMessages,
                    tools: tools,
                    stream: false,
                    options: {
                        temperature: this.temperature,
                        num_predict: this.maxTokens,
                    },
                });

                // レスポンスからテキストとツール呼び出しを取得
                fullContent = response.message?.content || '';

                // 構造化された tool_calls を確認
                if (response.message?.tool_calls && response.message.tool_calls.length > 0) {
                    toolCalls = response.message.tool_calls as ToolCallInfo[];
                }

                // フォールバック1: テキストにJSONツール呼び出しが含まれている場合
                if (toolCalls.length === 0 && fullContent) {
                    const fallbackCalls = parseToolCallsFromText(fullContent);
                    if (fallbackCalls.length > 0) {
                        if (this.debug) {
                            console.log(chalk.dim('  ℹ テキストからツール呼び出しを検出（JSONフォールバック）'));
                        }
                        toolCalls = fallbackCalls.map(fc => ({
                            function: { name: fc.name, arguments: fc.arguments },
                        }));
                        fullContent = '';
                    }
                }

                // フォールバック2: XMLツール呼び出し（Qwen互換）
                if (toolCalls.length === 0 && fullContent) {
                    const xmlCalls = parseXmlToolCalls(fullContent);
                    if (xmlCalls.length > 0) {
                        if (this.debug) {
                            console.log(chalk.dim('  ℹ テキストからツール呼び出しを検出（XMLフォールバック）'));
                        }
                        toolCalls = xmlCalls.map(fc => ({
                            function: { name: fc.name, arguments: fc.arguments },
                        }));
                        fullContent = '';
                    }
                }
            } catch (err) {
                const errorMsg = (err as Error).message;
                if (errorMsg.includes('not found') || errorMsg.includes('model')) {
                    throw new Error(
                        `モデル "${this.model}" が見つかりません。\n` +
                        `"ollama pull ${this.model}" でモデルをダウンロードしてください。`
                    );
                }
                throw err;
            }

            // ツール呼び出しがなければ、最終レスポンスとして返す
            if (toolCalls.length === 0) {
                if (fullContent) {
                    onToken(fullContent);
                }
                const assistantMessage: Message = { role: 'assistant', content: fullContent };
                return assistantMessage;
            }

            // テキスト部分があれば先に表示
            if (fullContent) {
                onToken(fullContent);
            }

            // アシスタントのメッセージ（ツール呼び出し情報含む）を追加
            const assistantMsg: Message = {
                role: 'assistant',
                content: fullContent,
                tool_calls: toolCalls.map(tc => ({
                    function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                    },
                })),
            };
            currentMessages.push(assistantMsg);

            // 各ツールを実行し、結果をメッセージに追加
            for (const toolCall of toolCalls) {
                const toolName = toolCall.function.name;
                const toolArgs = toolCall.function.arguments;

                if (onToolCall) onToolCall(toolName);

                const result = await executeTool(toolName, toolArgs);

                const toolMessage: Message = {
                    role: 'tool',
                    content: result,
                };
                currentMessages.push(toolMessage);
            }

            onToken('\n');
        }

        // 最大反復回数に達した場合
        const fallbackMessage: Message = {
            role: 'assistant',
            content: '\n[ツール呼び出しの最大回数に達しました。必要であれば続きを指示してください。]',
        };
        onToken(fallbackMessage.content);
        return fallbackMessage;
    }
}
