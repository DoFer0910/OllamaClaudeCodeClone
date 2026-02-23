// 並列エージェントツール — 複数のサブタスクを同時に実行する
import chalk from 'chalk';
import type { ToolDefinition } from '../types';

// サブエージェントランナーへの参照（sub-agent.tsと共有）
let _parallelRunner: ((prompt: string) => Promise<string>) | null = null;

// 並列エージェントランナーを設定する
export function setParallelAgentRunner(runner: (prompt: string) => Promise<string>): void {
    _parallelRunner = runner;
}

// 最大同時実行数
const MAX_CONCURRENT = 4;
// タイムアウト（5分）
const AGENT_TIMEOUT = 5 * 60 * 1000;

export const parallelAgentsTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'parallel_agents',
            description: '複数の独立したタスクを並列で実行する。各タスクは独立したサブエージェントとして動作する。最大4タスクまで。',
            parameters: {
                type: 'object',
                properties: {
                    tasks: {
                        type: 'array',
                        description: '並列実行するタスクの配列（最大4つ）',
                        items: {
                            type: 'object',
                            properties: {
                                title: { type: 'string', description: 'タスクのタイトル' },
                                prompt: { type: 'string', description: 'タスクの指示' },
                            },
                            required: ['title', 'prompt'],
                        },
                    },
                },
                required: ['tasks'],
            },
        },
    },

    async execute(args) {
        const taskList = args.tasks as Array<{ title: string; prompt: string }>;

        if (!_parallelRunner) {
            return { success: false, output: '', error: '並列エージェントが初期化されていません' };
        }

        if (!taskList || taskList.length === 0) {
            return { success: false, output: '', error: 'タスクが指定されていません' };
        }

        // 最大同時実行数に制限
        const limited = taskList.slice(0, MAX_CONCURRENT);

        console.log(chalk.cyan(`  🔀 ${limited.length}タスクを並列実行中...`));
        for (const task of limited) {
            console.log(chalk.dim(`    - ${task.title}`));
        }

        // 各タスクをPromiseとして実行（タイムアウト付き）
        const promises = limited.map(async (task, index) => {
            try {
                const result = await Promise.race([
                    _parallelRunner!(task.prompt),
                    new Promise<string>((_, reject) =>
                        setTimeout(() => reject(new Error('タイムアウト（5分）')), AGENT_TIMEOUT)
                    ),
                ]);
                console.log(chalk.green(`    ✓ タスク${index + 1}完了: ${task.title}`));
                return { title: task.title, success: true, result };
            } catch (err) {
                console.log(chalk.red(`    ✗ タスク${index + 1}失敗: ${task.title}`));
                return { title: task.title, success: false, result: (err as Error).message };
            }
        });

        const results = await Promise.all(promises);

        // 結果を整形
        const output = results
            .map((r, i) => {
                const status = r.success ? '✅ 成功' : '❌ 失敗';
                return `\n--- タスク${i + 1}: ${r.title} (${status}) ---\n${r.result}`;
            })
            .join('\n');

        const allSuccess = results.every(r => r.success);
        return { success: allSuccess, output: `[並列エージェント結果]\n${output}` };
    },
};
