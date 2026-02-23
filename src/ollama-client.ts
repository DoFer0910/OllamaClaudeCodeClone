// Ollama クライアント — API通信とエージェントループの管理
import { Ollama } from 'ollama';
import type { Message } from './types';
import { getToolDefinitions, executeTool } from './tools/index';

// エージェントループの最大反復回数（無限ループ防止）
const MAX_TOOL_ITERATIONS = 15;

export class OllamaClient {
    private client: Ollama;
    private model: string;

    constructor(host: string, model: string) {
        this.client = new Ollama({ host });
        this.model = model;
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

    // ストリーミングチャット + ツール呼び出しのエージェントループ
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

            // ストリーミングレスポンスの生成
            let fullContent = '';
            let toolCalls: Array<{ function: { name: string; arguments: Record<string, unknown> } }> = [];

            try {
                const stream = await this.client.chat({
                    model: this.model,
                    messages: currentMessages,
                    tools: tools,
                    stream: true,
                });

                for await (const chunk of stream) {
                    // テキストの処理
                    if (chunk.message?.content) {
                        fullContent += chunk.message.content;
                        onToken(chunk.message.content);
                    }

                    // ツール呼び出しの処理
                    if (chunk.message?.tool_calls && chunk.message.tool_calls.length > 0) {
                        toolCalls = chunk.message.tool_calls as typeof toolCalls;
                    }
                }
            } catch (err) {
                const errorMsg = (err as Error).message;
                // モデルが見つからない場合の分かりやすいエラー
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
                const assistantMessage: Message = { role: 'assistant', content: fullContent };
                return assistantMessage;
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

                // ツール呼び出しの通知
                if (onToolCall) onToolCall(toolName);

                // ツール実行
                const result = await executeTool(toolName, toolArgs);

                // ツール結果をメッセージに追加
                const toolMessage: Message = {
                    role: 'tool',
                    content: result,
                };
                currentMessages.push(toolMessage);
            }

            // 次のイテレーションでは改行を出力して区切る
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
