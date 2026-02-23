// ファイル監視 — ポーリングベースの外部ファイル変更検出
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import type { FileChange } from './types';

// 監視対象の拡張子
const WATCHED_EXTENSIONS = new Set([
    '.py', '.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.json',
    '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.rb', '.php',
    '.yaml', '.yml', '.toml', '.md', '.txt', '.sh', '.bat', '.ps1',
    '.sql', '.graphql', '.vue', '.svelte',
]);

// 無視するディレクトリ
const IGNORED_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '__pycache__', '.next',
    '.venv', 'venv', '.tox', 'target', 'vendor', '.cache',
]);

// ファイルのスナップショット型
interface FileSnapshot {
    path: string;
    mtime: number;
    size: number;
}

// ファイル監視クラス
export class FileWatcher {
    private enabled: boolean = false;
    private snapshot: Map<string, FileSnapshot> = new Map();
    private pendingChanges: FileChange[] = [];
    private pollInterval: ReturnType<typeof setInterval> | null = null;
    private cwd: string;

    constructor(cwd?: string) {
        this.cwd = cwd || process.cwd();
    }

    // 監視のON/OFFを切り替える
    toggle(): boolean {
        if (this.enabled) {
            this.stop();
        } else {
            this.start();
        }
        return this.enabled;
    }

    // 監視を開始する
    async start(): Promise<void> {
        if (this.enabled) return;

        this.enabled = true;
        await this.refreshSnapshot();

        // 2秒間隔でポーリング
        this.pollInterval = setInterval(async () => {
            if (!this.enabled) return;
            await this.pollChanges();
        }, 2000);

        console.log(chalk.green('  ✓ ファイル監視を開始しました（2秒間隔）'));
    }

    // 監視を停止する
    stop(): void {
        this.enabled = false;
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        console.log(chalk.dim('  ℹ ファイル監視を停止しました'));
    }

    // スナップショットを更新する（Write/Edit後に呼び出す）
    async refreshSnapshot(): Promise<void> {
        this.snapshot.clear();
        await this.scanDirectory(this.cwd);
    }

    // 保留中の変更を取得してクリアする
    consumeChanges(): FileChange[] {
        const changes = [...this.pendingChanges];
        this.pendingChanges = [];
        return changes;
    }

    // 監視が有効かどうか
    isEnabled(): boolean {
        return this.enabled;
    }

    // ディレクトリを再帰的にスキャンしてスナップショットを構築する
    private async scanDirectory(dir: string, depth: number = 0): Promise<void> {
        if (depth > 5) return; // 深さ制限

        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (IGNORED_DIRS.has(entry.name)) continue;

                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    await this.scanDirectory(fullPath, depth + 1);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (!WATCHED_EXTENSIONS.has(ext)) continue;

                    try {
                        const stat = await fs.stat(fullPath);
                        this.snapshot.set(fullPath, {
                            path: fullPath,
                            mtime: stat.mtimeMs,
                            size: stat.size,
                        });
                    } catch { /* ファイルアクセスエラーは無視 */ }
                }
            }
        } catch { /* ディレクトリアクセスエラーは無視 */ }
    }

    // 変更をポーリングで検出する
    private async pollChanges(): Promise<void> {
        const newSnapshot = new Map<string, FileSnapshot>();
        await this.scanDirectoryForPoll(this.cwd, newSnapshot);

        // 変更・削除の検出
        for (const [filePath, oldInfo] of this.snapshot) {
            const newInfo = newSnapshot.get(filePath);
            if (!newInfo) {
                // ファイルが削除された
                this.pendingChanges.push({
                    path: path.relative(this.cwd, filePath),
                    type: 'deleted',
                    timestamp: Date.now(),
                });
            } else if (newInfo.mtime !== oldInfo.mtime || newInfo.size !== oldInfo.size) {
                // ファイルが変更された
                this.pendingChanges.push({
                    path: path.relative(this.cwd, filePath),
                    type: 'modified',
                    timestamp: Date.now(),
                });
            }
        }

        // 新規ファイルの検出
        for (const [filePath] of newSnapshot) {
            if (!this.snapshot.has(filePath)) {
                this.pendingChanges.push({
                    path: path.relative(this.cwd, filePath),
                    type: 'created',
                    timestamp: Date.now(),
                });
            }
        }

        this.snapshot = newSnapshot;
    }

    // ポーリング用のディレクトリスキャン
    private async scanDirectoryForPoll(dir: string, target: Map<string, FileSnapshot>, depth: number = 0): Promise<void> {
        if (depth > 5) return;

        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (IGNORED_DIRS.has(entry.name)) continue;

                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    await this.scanDirectoryForPoll(fullPath, target, depth + 1);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (!WATCHED_EXTENSIONS.has(ext)) continue;

                    try {
                        const stat = await fs.stat(fullPath);
                        target.set(fullPath, {
                            path: fullPath,
                            mtime: stat.mtimeMs,
                            size: stat.size,
                        });
                    } catch { /* 無視 */ }
                }
            }
        } catch { /* 無視 */ }
    }
}

// ファイル変更をLLMへのシステムノートとして整形する
export function formatFileChangesForLLM(changes: FileChange[]): string {
    if (changes.length === 0) return '';

    const typeLabels: Record<string, string> = {
        created: '新規作成',
        modified: '変更',
        deleted: '削除',
    };

    let note = '\n[ファイル変更検出 — 外部エディタにより以下のファイルが変更されました]\n';
    for (const change of changes) {
        note += `  - ${typeLabels[change.type]}: ${change.path}\n`;
    }
    return note;
}
