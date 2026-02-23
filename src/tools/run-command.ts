// コマンド実行ツール — ユーザー承認付き + バックグラウンド実行対応
import { spawn } from 'child_process';
import { truncate } from '../utils';
import { confirmAction, assessCommandDanger } from '../confirm';
import type { ToolDefinition } from '../types';

// コマンド出力の最大長
const MAX_OUTPUT_LENGTH = 50000;
// コマンドのタイムアウト: 通常30秒、バックグラウンド5分
const COMMAND_TIMEOUT = 30000;
const BG_COMMAND_TIMEOUT = 300000;

// バックグラウンドプロセスの管理
const backgroundProcesses: Map<string, { pid: number; stdout: string; stderr: string; done: boolean; exitCode: number | null }> = new Map();
let bgId = 0;

export const runCommandTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'run_command',
            description: 'シェルコマンドを実行し、標準出力と標準エラー出力を返す。実行前にユーザーの承認を求める。background=true でバックグラウンド実行も可能。',
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
                    background: {
                        type: 'boolean',
                        description: 'trueの場合、バックグラウンドで実行し即座にIDを返す（デフォルト: false）',
                    },
                    timeout: {
                        type: 'number',
                        description: 'タイムアウト秒数（省略時: 通常30秒、バックグラウンド300秒）',
                    },
                },
                required: ['command'],
            },
        },
    },

    async execute(args) {
        const command = args.command as string;
        const cwd = (args.cwd as string) || process.cwd();
        const background = (args.background as boolean) || false;
        const customTimeout = args.timeout as number | undefined;

        // コマンドの危険度を判定
        const danger = assessCommandDanger(command);

        // 危険コマンドの場合、理由を表示
        const details = danger.reasons.length > 0
            ? `コマンド: ${command}\n  ⚠ 検出された危険: ${danger.reasons.join(', ')}`
            : `コマンド: ${command}`;

        // ユーザー承認を求める
        const approved = await confirmAction({
            description: background ? 'バックグラウンドでシェルコマンドを実行します' : 'シェルコマンドを実行します',
            details,
            level: danger.level,
        });

        if (!approved) {
            return {
                success: false,
                output: '',
                error: 'ユーザーによりコマンド実行がキャンセルされました',
            };
        }

        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'cmd.exe' : '/bin/sh';
        const shellArgs = isWindows ? ['/c', command] : ['-c', command];
        const timeoutMs = customTimeout
            ? customTimeout * 1000
            : (background ? BG_COMMAND_TIMEOUT : COMMAND_TIMEOUT);

        // バックグラウンド実行
        if (background) {
            const id = `bg-${++bgId}`;
            const state = { pid: 0, stdout: '', stderr: '', done: false, exitCode: null as number | null };
            backgroundProcesses.set(id, state);

            const child = spawn(shell, shellArgs, {
                cwd,
                env: { ...process.env, PAGER: 'cat' },
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: false,
            });

            state.pid = child.pid || 0;

            child.stdout?.on('data', (data: Buffer) => {
                state.stdout += data.toString();
                // 出力サイズ制限
                if (state.stdout.length > MAX_OUTPUT_LENGTH) {
                    state.stdout = state.stdout.substring(state.stdout.length - MAX_OUTPUT_LENGTH);
                }
            });

            child.stderr?.on('data', (data: Buffer) => {
                state.stderr += data.toString();
            });

            child.on('close', (code) => {
                state.done = true;
                state.exitCode = code;
            });

            setTimeout(() => {
                if (!state.done) {
                    child.kill('SIGTERM');
                    state.done = true;
                    state.exitCode = -1;
                }
            }, timeoutMs);

            return {
                success: true,
                output: `バックグラウンドプロセスを開始しました。\nID: ${id}\nPID: ${state.pid}\nコマンド: ${command}\n\n後で run_command(command="bg-status ${id}") で状態を確認できます。`,
            };
        }

        // 同期実行
        return new Promise((resolve) => {
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
                    error: `コマンドがタイムアウトしました（${timeoutMs / 1000}秒）`,
                });
            }, timeoutMs);

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
