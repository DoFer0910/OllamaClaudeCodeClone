// MCPクライアント — Model Context Protocol (JSON-RPC 2.0 over stdio)
import { spawn, type ChildProcess } from 'child_process';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { MCPConfig, MCPServerConfig, ToolDefinition, ToolResult } from './types';

// MCP接続情報
interface MCPConnection {
    name: string;
    process: ChildProcess;
    tools: MCPToolInfo[];
    requestId: number;
}

// MCPツール情報
interface MCPToolInfo {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

// アクティブなMCP接続
const connections: Map<string, MCPConnection> = new Map();

// MCP設定ファイルのパスを取得する
function getMCPConfigPaths(): string[] {
    const cwd = process.cwd();
    return [
        path.join(cwd, '.shiningcode', 'mcp.json'),
        path.join(os.homedir(), '.config', 'shiningcode', 'mcp.json'),
    ];
}

// MCP設定を読み込む
async function loadMCPConfig(): Promise<MCPConfig | null> {
    for (const configPath of getMCPConfigPaths()) {
        try {
            const content = await fs.readFile(configPath, 'utf-8');
            return JSON.parse(content) as MCPConfig;
        } catch { /* ファイルが見つからないか壊れている */ }
    }
    return null;
}

// JSON-RPCリクエストを送信する
function sendJsonRpc(connection: MCPConnection, method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const id = ++connection.requestId;
        const request = JSON.stringify({
            jsonrpc: '2.0',
            id,
            method,
            params: params || {},
        });

        let responseBuffer = '';
        const timeout = setTimeout(() => {
            reject(new Error(`MCPリクエストタイムアウト: ${method}`));
        }, 10000);

        const onData = (data: Buffer) => {
            responseBuffer += data.toString();
            // JSON-RPCレスポンスの検出（改行区切り）
            const lines = responseBuffer.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const response = JSON.parse(trimmed);
                    if (response.id === id) {
                        clearTimeout(timeout);
                        connection.process.stdout?.removeListener('data', onData);
                        if (response.error) {
                            reject(new Error(response.error.message || 'MCPエラー'));
                        } else {
                            resolve(response.result);
                        }
                        return;
                    }
                } catch { /* JSONパース失敗は無視 */ }
            }
        };

        connection.process.stdout?.on('data', onData);
        connection.process.stdin?.write(request + '\n');
    });
}

// MCPサーバーに接続してツールを検出する
async function connectToServer(name: string, config: MCPServerConfig): Promise<MCPConnection | null> {
    try {
        const child = spawn(config.command, config.args || [], {
            env: { ...process.env, ...config.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        const connection: MCPConnection = {
            name,
            process: child,
            tools: [],
            requestId: 0,
        };

        // エラー出力をログに記録
        child.stderr?.on('data', (data: Buffer) => {
            if (process.env.SHININGCODE_DEBUG) {
                console.log(chalk.dim(`  [MCP ${name}] ${data.toString().trim()}`));
            }
        });

        // 初期化
        await sendJsonRpc(connection, 'initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'shiningcode', version: '1.0.0' },
        });

        // ツール一覧を取得
        const toolsResult = await sendJsonRpc(connection, 'tools/list') as { tools: MCPToolInfo[] };
        connection.tools = toolsResult.tools || [];

        console.log(chalk.green(`  ✓ MCP "${name}" 接続完了 (${connection.tools.length}ツール検出)`));
        return connection;
    } catch (err) {
        console.log(chalk.yellow(`  ⚠ MCP "${name}" 接続失敗: ${(err as Error).message}`));
        return null;
    }
}

// 全MCPサーバーを初期化してツールを登録する
export async function initializeMCP(): Promise<ToolDefinition[]> {
    const config = await loadMCPConfig();
    if (!config || !config.mcpServers) {
        return [];
    }

    const mcpTools: ToolDefinition[] = [];

    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
        const connection = await connectToServer(serverName, serverConfig);
        if (!connection) continue;

        connections.set(serverName, connection);

        // 各ツールをToolDefinitionに変換
        for (const tool of connection.tools) {
            const fullName = `mcp_${serverName}_${tool.name}`;
            mcpTools.push({
                definition: {
                    type: 'function',
                    function: {
                        name: fullName,
                        description: `[MCP:${serverName}] ${tool.description}`,
                        parameters: tool.inputSchema as Record<string, unknown>,
                    },
                },
                async execute(args: Record<string, unknown>): Promise<ToolResult> {
                    try {
                        const conn = connections.get(serverName);
                        if (!conn) {
                            return { success: false, output: '', error: `MCPサーバー "${serverName}" に接続されていません` };
                        }

                        const result = await sendJsonRpc(conn, 'tools/call', {
                            name: tool.name,
                            arguments: args,
                        }) as { content: Array<{ type: string; text?: string }> };

                        const text = (result.content || [])
                            .filter((c: { type: string }) => c.type === 'text')
                            .map((c: { text?: string }) => c.text || '')
                            .join('\n');

                        return { success: true, output: text };
                    } catch (err) {
                        return { success: false, output: '', error: `MCPツールエラー: ${(err as Error).message}` };
                    }
                },
            });
        }
    }

    return mcpTools;
}

// 全MCP接続を閉じる
export function closeMCP(): void {
    for (const [, connection] of connections) {
        try {
            connection.process.kill();
        } catch { /* 無視 */ }
    }
    connections.clear();
}

// MCP接続状態を表示する
export function printMCPStatus(): void {
    if (connections.size === 0) {
        console.log(chalk.dim('  MCP接続なし'));
        return;
    }

    console.log(chalk.cyan('  MCP接続:'));
    for (const [name, conn] of connections) {
        console.log(chalk.dim(`    - ${name}: ${conn.tools.length}ツール`));
        for (const tool of conn.tools) {
            console.log(chalk.dim(`      ・ mcp_${name}_${tool.name}: ${tool.description}`));
        }
    }
}
