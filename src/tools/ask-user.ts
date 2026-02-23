// ユーザー質問ツール — LLMがユーザーに質問するためのツール
import readline from 'readline';
import chalk from 'chalk';
import type { ToolDefinition } from '../types';

export const askUserTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'ask_user',
            description: 'ユーザーに質問を行い、回答を取得する。仕様が不明確な場合や、ユーザーの判断が必要な場合に使用する。',
            parameters: {
                type: 'object',
                properties: {
                    question: {
                        type: 'string',
                        description: 'ユーザーへの質問内容',
                    },
                },
                required: ['question'],
            },
        },
    },

    async execute(args) {
        const question = args.question as string;

        console.log('');
        console.log(chalk.bgCyan.white.bold(' 💬 AIからの質問 '));
        console.log(chalk.cyan(`  ${question}`));
        console.log('');

        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });

            rl.question(chalk.yellow('  回答: '), (answer) => {
                rl.close();
                const trimmed = answer.trim();
                if (!trimmed) {
                    resolve({ success: true, output: '(ユーザーは回答をスキップしました)' });
                } else {
                    resolve({ success: true, output: `ユーザーの回答: ${trimmed}` });
                }
            });
        });
    },
};
