// コマンド実行ツール
import { spawn } from 'child_process';
import { truncate } from '../utils';
import type { ToolDefinition } from '../types';

// コマンド出力の最大長
const MAX_OUTPUT_LENGTH = 50000;
// コマンドのタイムアウト（ミリ秒）
const COMMAND_TIMEOUT = 30000;

export const runCommandTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'run_command',
            description: 'シェルコマンドを実行し、標準出力と標準エラー出力を返す。',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: '実行するコマンド（例: "dir", "git status", "npm test"）',
                    },
                    cwd: {
                        type: 'string',
                        description: 'コマンドの実行ディレクトリ（省略時はカレントディレクトリ）',
                    },
                },
                required: ['command'],
            },
        },
    },

    async execute(args) {
        const command = args.command as string;
        const cwd = (args.cwd as string) || process.cwd();

        return new Promise((resolve) => {
            const isWindows = process.platform === 'win32';
            const shell = isWindows ? 'cmd.exe' : '/bin/sh';
            const shellArgs = isWindows ? ['/c', command] : ['-c', command];

            let stdout = '';
            let stderr = '';

            const child = spawn(shell, shellArgs, {
                cwd,
                env: { ...process.env, PAGER: 'cat' },
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            // タイムアウト設定
            const timeout = setTimeout(() => {
                child.kill('SIGTERM');
                resolve({
                    success: false,
                    output: truncate(stdout, MAX_OUTPUT_LENGTH),
                    error: `コマンドがタイムアウトしました（${COMMAND_TIMEOUT / 1000}秒）`,
                });
            }, COMMAND_TIMEOUT);

            child.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                clearTimeout(timeout);

                const output = [
                    `コマンド: ${command}`,
                    `終了コード: ${code}`,
                    stdout ? `\n--- 標準出力 ---\n${truncate(stdout, MAX_OUTPUT_LENGTH)}` : '',
                    stderr ? `\n--- 標準エラー ---\n${truncate(stderr, MAX_OUTPUT_LENGTH)}` : '',
                ]
                    .filter(Boolean)
                    .join('\n');

                resolve({
                    success: code === 0,
                    output,
                    error: code !== 0 ? `コマンドが終了コード ${code} で終了しました` : undefined,
                });
            });

            child.on('error', (err) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    output: '',
                    error: `コマンド実行エラー: ${err.message}`,
                });
            });
        });
    },
};
