// サブエージェントツール — 独立したコンテキストでサブタスクを実行する
import type { ToolDefinition } from '../types';

// サブエージェント実行用のインターフェース（CLIから注入される）
let _subAgentRunner: ((prompt: string) => Promise<string>) | null = null;

// サブエージェントランナーを設定する（CLI初期化時に呼び出す）
export function setSubAgentRunner(runner: (prompt: string) => Promise<string>): void {
    _subAgentRunner = runner;
}

export const subAgentTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'sub_agent',
            description: '独立したコンテキストでサブタスクを実行するサブエージェント。メインの会話履歴に影響を与えずに複雑なサブタスクを処理する。',
            parameters: {
                type: 'object',
                properties: {
                    prompt: {
                        type: 'string',
                        description: 'サブエージェントに与えるタスクの指示',
                    },
                },
                required: ['prompt'],
            },
        },
    },

    async execute(args) {
        const prompt = args.prompt as string;

        if (!_subAgentRunner) {
            return {
                success: false,
                output: '',
                error: 'サブエージェントが初期化されていません',
            };
        }

        try {
            const result = await _subAgentRunner(prompt);
            return { success: true, output: `[サブエージェント結果]\n${result}` };
        } catch (err) {
            return {
                success: false,
                output: '',
                error: `サブエージェントエラー: ${(err as Error).message}`,
            };
        }
    },
};
