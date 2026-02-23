// タスク管理ツール — タスクのCRUD操作
import type { ToolDefinition, TaskInfo } from '../types';

// インメモリのタスクストア
const tasks: Map<string, TaskInfo> = new Map();
let nextId = 1;

// タスク作成
export const taskCreateTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'task_create',
            description: '新しいタスクを作成する。複雑な作業を管理可能なサブタスクに分解するために使用する。',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'タスクのタイトル' },
                    description: { type: 'string', description: 'タスクの詳細説明' },
                },
                required: ['title'],
            },
        },
    },
    async execute(args) {
        const id = `task-${nextId++}`;
        const now = new Date().toISOString();
        const task: TaskInfo = {
            id,
            title: args.title as string,
            status: 'pending',
            description: (args.description as string) || '',
            createdAt: now,
            updatedAt: now,
        };
        tasks.set(id, task);
        return { success: true, output: `タスクを作成しました: ${id} — ${task.title}` };
    },
};

// タスク一覧
export const taskListTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'task_list',
            description: '全タスクの一覧を表示する。',
            parameters: {
                type: 'object',
                properties: {
                    status: { type: 'string', description: 'フィルタするステータス: pending, in_progress, done（省略時は全件）' },
                },
            },
        },
    },
    async execute(args) {
        const statusFilter = args.status as string | undefined;
        const allTasks = Array.from(tasks.values());
        const filtered = statusFilter
            ? allTasks.filter(t => t.status === statusFilter)
            : allTasks;

        if (filtered.length === 0) {
            return { success: true, output: 'タスクはありません。' };
        }

        const statusIcon: Record<string, string> = {
            pending: '⬜',
            in_progress: '🔄',
            done: '✅',
        };

        const lines = filtered.map(t =>
            `${statusIcon[t.status] || '?'} [${t.id}] ${t.title} (${t.status})`
        );
        return { success: true, output: lines.join('\n') };
    },
};

// タスク取得
export const taskGetTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'task_get',
            description: '指定したIDのタスク詳細を取得する。',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'タスクID' },
                },
                required: ['id'],
            },
        },
    },
    async execute(args) {
        const id = args.id as string;
        const task = tasks.get(id);
        if (!task) {
            return { success: false, output: '', error: `タスクが見つかりません: ${id}` };
        }
        return {
            success: true,
            output: [
                `ID: ${task.id}`,
                `タイトル: ${task.title}`,
                `ステータス: ${task.status}`,
                `説明: ${task.description || '(なし)'}`,
                `作成日時: ${task.createdAt}`,
                `更新日時: ${task.updatedAt}`,
            ].join('\n'),
        };
    },
};

// タスク更新
export const taskUpdateTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'task_update',
            description: 'タスクのステータスや詳細を更新する。',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'タスクID' },
                    status: { type: 'string', description: '新しいステータス: pending, in_progress, done' },
                    description: { type: 'string', description: '新しい説明' },
                },
                required: ['id'],
            },
        },
    },
    async execute(args) {
        const id = args.id as string;
        const task = tasks.get(id);
        if (!task) {
            return { success: false, output: '', error: `タスクが見つかりません: ${id}` };
        }
        if (args.status) task.status = args.status as TaskInfo['status'];
        if (args.description) task.description = args.description as string;
        task.updatedAt = new Date().toISOString();
        return { success: true, output: `タスクを更新しました: ${id} — ${task.title} (${task.status})` };
    },
};
