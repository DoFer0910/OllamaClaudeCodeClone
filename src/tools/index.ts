// ツールレジストリ — 全ツールの登録・管理・ディスパッチ
import type { ToolDefinition, Tool } from '../types';
import { readFileTool } from './read-file';
import { writeFileTool } from './write-file';
import { editFileTool } from './edit-file';
import { runCommandTool } from './run-command';
import { searchFilesTool } from './search-files';
import { grepSearchTool } from './grep-search';
import { listDirectoryTool } from './list-directory';
import { webFetchTool } from './web-fetch';
import { webSearchTool } from './web-search';
import { subAgentTool } from './sub-agent';
import { parallelAgentsTool } from './parallel-agents';
import { taskCreateTool, taskListTool, taskGetTool, taskUpdateTool } from './task-manager';
import { askUserTool } from './ask-user';
import { notebookEditTool } from './notebook-edit';
import { logToolCall, logToolResult } from '../utils';
import { isToolAllowedInCurrentMode, getCurrentMode } from '../plan-act';
import chalk from 'chalk';

// 全ツールの一覧（16ツール）
const tools: Map<string, ToolDefinition> = new Map([
    // === 基本I/O ===
    ['read_file', readFileTool],
    ['write_file', writeFileTool],
    ['edit_file', editFileTool],
    ['run_command', runCommandTool],
    ['search_files', searchFilesTool],
    ['grep_search', grepSearchTool],
    ['list_directory', listDirectoryTool],
    // === Web ===
    ['web_fetch', webFetchTool],
    ['web_search', webSearchTool],
    // === エージェント ===
    ['sub_agent', subAgentTool],
    ['parallel_agents', parallelAgentsTool],
    // === タスク管理 ===
    ['task_create', taskCreateTool],
    ['task_list', taskListTool],
    ['task_get', taskGetTool],
    ['task_update', taskUpdateTool],
    // === インタラクション ===
    ['ask_user', askUserTool],
    // === Notebook ===
    ['notebook_edit', notebookEditTool],
]);

// MCPツールを動的に登録する
export function registerTool(name: string, tool: ToolDefinition): void {
    tools.set(name, tool);
}

// Ollama API に渡すツール定義の配列を取得する
export function getToolDefinitions(): Tool[] {
    return Array.from(tools.values()).map((t) => t.definition);
}

// ツールを名前で実行する（Plan/Actモード対応）
export async function executeTool(
    name: string,
    args: Record<string, unknown>
): Promise<string> {
    const tool = tools.get(name);
    if (!tool) {
        return JSON.stringify({ error: `不明なツール: ${name}` });
    }

    // Plan/Actモードチェック
    if (!isToolAllowedInCurrentMode(name)) {
        const mode = getCurrentMode();
        console.log(chalk.yellow(`  ⚠ ${name} はPlanモードでは使用できません。/approve で実行モードに切り替えてください。`));
        return JSON.stringify({
            error: `ツール "${name}" は${mode}モードでは使用できません。/approve で実行モードに切り替えてください。`,
        });
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

// ツール数を取得
export function getToolCount(): number {
    return tools.size;
}
