// Jupyter Notebook編集ツール — .ipynbファイルのセル操作
import fs from 'fs/promises';
import { resolvePath, fileExists } from '../utils';
import type { ToolDefinition } from '../types';

// Notebookの型（簡略版）
interface NotebookCell {
    cell_type: 'code' | 'markdown' | 'raw';
    source: string[];
    metadata: Record<string, unknown>;
    outputs?: unknown[];
    execution_count?: number | null;
}

interface Notebook {
    cells: NotebookCell[];
    metadata: Record<string, unknown>;
    nbformat: number;
    nbformat_minor: number;
}

export const notebookEditTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'notebook_edit',
            description: 'Jupyter Notebook (.ipynb) のセルを編集する。セルの追加、変更、削除が可能。',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Notebookファイルのパス(.ipynb)',
                    },
                    action: {
                        type: 'string',
                        description: '操作: "add"(セル追加), "edit"(セル編集), "delete"(セル削除), "list"(セル一覧)',
                    },
                    cellIndex: {
                        type: 'number',
                        description: '対象セルのインデックス（0始まり）。add, edit, deleteで使用。',
                    },
                    cellType: {
                        type: 'string',
                        description: 'セルの種類: "code" または "markdown"（addで使用、デフォルト: "code"）',
                    },
                    content: {
                        type: 'string',
                        description: 'セルの内容（add, editで使用）',
                    },
                },
                required: ['path', 'action'],
            },
        },
    },

    async execute(args) {
        const filePath = resolvePath(args.path as string);
        const action = args.action as string;

        try {
            // list以外はファイルの存在確認
            if (action !== 'add' || await fileExists(filePath)) {
                if (!(await fileExists(filePath))) {
                    return { success: false, output: '', error: `ファイルが見つかりません: ${filePath}` };
                }
            }

            // ファイルの読み込みまたは新規作成
            let notebook: Notebook;
            if (await fileExists(filePath)) {
                const content = await fs.readFile(filePath, 'utf-8');
                notebook = JSON.parse(content) as Notebook;
            } else {
                // 新規Notebook作成
                notebook = {
                    cells: [],
                    metadata: {
                        kernelspec: {
                            display_name: 'Python 3',
                            language: 'python',
                            name: 'python3',
                        },
                        language_info: { name: 'python', version: '3.9.0' },
                    },
                    nbformat: 4,
                    nbformat_minor: 5,
                };
            }

            switch (action) {
                case 'list': {
                    if (notebook.cells.length === 0) {
                        return { success: true, output: 'セルはありません。' };
                    }
                    const lines = notebook.cells.map((cell, i) => {
                        const src = cell.source.join('').substring(0, 80);
                        return `[${i}] (${cell.cell_type}) ${src}${src.length >= 80 ? '...' : ''}`;
                    });
                    return { success: true, output: lines.join('\n') };
                }

                case 'add': {
                    const cellType = (args.cellType as string) || 'code';
                    const content = (args.content as string) || '';
                    const index = args.cellIndex as number | undefined;

                    const newCell: NotebookCell = {
                        cell_type: cellType as 'code' | 'markdown',
                        source: content.split('\n').map((line, i, arr) =>
                            i < arr.length - 1 ? line + '\n' : line
                        ),
                        metadata: {},
                        ...(cellType === 'code' ? { outputs: [], execution_count: null } : {}),
                    };

                    if (index !== undefined && index >= 0 && index <= notebook.cells.length) {
                        notebook.cells.splice(index, 0, newCell);
                    } else {
                        notebook.cells.push(newCell);
                    }

                    await fs.writeFile(filePath, JSON.stringify(notebook, null, 1), 'utf-8');
                    return { success: true, output: `セルを追加しました（${cellType}、インデックス: ${index ?? notebook.cells.length - 1}）` };
                }

                case 'edit': {
                    const cellIndex = args.cellIndex as number;
                    const content = args.content as string;

                    if (cellIndex === undefined || cellIndex < 0 || cellIndex >= notebook.cells.length) {
                        return { success: false, output: '', error: `無効なセルインデックス: ${cellIndex}（0-${notebook.cells.length - 1}）` };
                    }

                    notebook.cells[cellIndex].source = content.split('\n').map((line, i, arr) =>
                        i < arr.length - 1 ? line + '\n' : line
                    );

                    await fs.writeFile(filePath, JSON.stringify(notebook, null, 1), 'utf-8');
                    return { success: true, output: `セル[${cellIndex}]を編集しました。` };
                }

                case 'delete': {
                    const delIndex = args.cellIndex as number;

                    if (delIndex === undefined || delIndex < 0 || delIndex >= notebook.cells.length) {
                        return { success: false, output: '', error: `無効なセルインデックス: ${delIndex}` };
                    }

                    notebook.cells.splice(delIndex, 1);
                    await fs.writeFile(filePath, JSON.stringify(notebook, null, 1), 'utf-8');
                    return { success: true, output: `セル[${delIndex}]を削除しました。` };
                }

                default:
                    return { success: false, output: '', error: `不明なアクション: ${action}` };
            }
        } catch (err) {
            return { success: false, output: '', error: `Notebook操作エラー: ${(err as Error).message}` };
        }
    },
};
