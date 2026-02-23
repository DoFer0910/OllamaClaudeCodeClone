// ツールレジストリ — 全ツールの登録・管理・ディスパッチ
import type { ToolDefinition, Tool } from '../types';
import { readFileTool } from './read-file';
import { writeFileTool } from './write-file';
import { editFileTool } from './edit-file';
import { runCommandTool } from './run-command';
import { searchFilesTool } from './search-files';
import { grepSearchTool } from './grep-search';
import { listDirectoryTool } from './list-directory';
import { logToolCall, logToolResult } from '../utils';

// 全ツールの一覧
const tools: Map<string, ToolDefinition> = new Map([
    ['read_file', readFileTool],
    ['write_file', writeFileTool],
    ['edit_file', editFileTool],
    ['run_command', runCommandTool],
    ['search_files', searchFilesTool],
    ['grep_search', grepSearchTool],
    ['list_directory', listDirectoryTool],
]);

// Ollama API に渡すツール定義の配列を取得する
export function getToolDefinitions(): Tool[] {
    return Array.from(tools.values()).map((t) => t.definition);
}

// ツールを名前で実行する
export async function executeTool(
    name: string,
    args: Record<string, unknown>
): Promise<string> {
    const tool = tools.get(name);
    if (!tool) {
        return JSON.stringify({ error: `不明なツール: ${name}` });
    }

    // ツール呼び出しをログに表示
    logToolCall(name, args);

    const result = await tool.execute(args);

    // ツール結果をログに表示
    logToolResult(result.success, result.success ? '完了' : (result.error || 'エラー'));

    if (!result.success) {
        return JSON.stringify({ error: result.error, output: result.output });
    }

    return result.output;
}

// 登録されているツール名の一覧を取得
export function getToolNames(): string[] {
    return Array.from(tools.keys());
}
