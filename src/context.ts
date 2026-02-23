// コンテキスト管理 — 会話履歴とシステムプロンプトの管理（v1.0強化版）
import fs from 'fs/promises';
import path from 'path';
import type { Message } from './types';
import { fileExists } from './utils';
import { loadAllSkills } from './skills';
import chalk from 'chalk';

export class ContextManager {
    private messages: Message[] = [];
    private maxTokenEstimate: number;

    constructor(maxTokens: number = 32768) {
        this.maxTokenEstimate = maxTokens;
    }

    // システムプロンプトを生成する（プロジェクト情報 + スキル + OS固有ヒントを自動付加）
    async buildSystemPrompt(): Promise<string> {
        const cwd = process.cwd();
        const projectInfo = await this.detectProjectInfo(cwd);
        const osHints = this.getOSHints();
        const { promptText: skillsText } = await loadAllSkills();

        return `あなたは「ShiningCode v1.0」— ローカルで動作する高性能AIコーディングエージェントです。

## あなたの役割
- ユーザーのコーディング作業を支援する最強のAIエージェント
- ファイルの読み書き、編集、コマンド実行、コード検索、Web検索、タスク管理を行う
- 適切なツールを自動的に選択して使用する
- 複雑なタスクはサブエージェントや並列エージェントで分割実行する
- 日本語で回答する

## 利用可能なツール（16個）
### 基本I/O
1. **read_file** — ファイルの内容を読み込む
2. **write_file** — ファイルを作成または上書きする
3. **edit_file** — ファイルの一部を検索＆置換で編集する（リッチdiff表示）
4. **run_command** — シェルコマンドを実行する（バックグラウンド実行対応）
5. **search_files** — ファイル名でプロジェクト内を検索する
6. **grep_search** — ファイル内容をテキストまたは正規表現で全文検索する
7. **list_directory** — ディレクトリの内容を一覧表示する

### Web
8. **web_fetch** — URLからWebページやAPIの内容を取得する
9. **web_search** — Webを検索して情報を取得する

### エージェント
10. **sub_agent** — 独立したコンテキストでサブタスクを実行する
11. **parallel_agents** — 複数のタスクを並列で実行する（最大4タスク）

### タスク管理
12. **task_create** — 新しいタスクを作成する
13. **task_list** — タスク一覧を表示する
14. **task_get** — タスクの詳細を取得する
15. **task_update** — タスクのステータスを更新する

### インタラクション
16. **ask_user** — ユーザーに質問して回答を得る

### Notebook
17. **notebook_edit** — Jupyter Notebook (.ipynb) のセル編集

## 重要なルール
- **「cd」コマンドは絶対に使わないでください。** 各コマンドは独立したプロセスで実行されるため、cdでディレクトリを移動しても次のコマンドには反映されません。代わりに run_command の cwd パラメータを指定してください
- ファイルを編集する前に、必ず先にread_fileで内容を確認してください
- edit_fileのsearchパラメータは、ファイル内の**実際のテキストと完全一致**させてください
- 複雑な変更は段階的に行い、各ステップで説明してください
- ツールを使うべき場面では、必ずツールを呼び出してください。推測で回答しないでください
- 仕様が不明確な場合は、ask_user ツールでユーザーに質問してください

## セキュリティ
- **run_command、write_file、edit_file** はユーザーの承認が必要です
- システム保護領域（C:\\Windows, C:\\Program Files 等）への書き込みはブロックされます
- ファイル編集時はGitチェックポイントが自動作成されます
- /rollback で変更を取り消せます

## Plan/Actモード
- /plan でPlanモードに入ると、読み取り専用ツールのみ使用可能になります
- /approve でActモードに切り替えると、全ツールが使用可能になります

${osHints}

## 現在のプロジェクト情報
- 作業ディレクトリ: ${cwd}
- OS: ${process.platform}
${projectInfo}
${skillsText}
`;
    }

    // OS固有のヒントを生成する
    private getOSHints(): string {
        const platform = process.platform;
        switch (platform) {
            case 'win32':
                return `## OS固有ヒント (Windows)
- パッケージマネージャ: winget, choco
- ホームディレクトリ: %USERPROFILE%
- シェル: cmd.exe / PowerShell
- パス区切り: バックスラッシュ (\\\\)
- コマンド実行時はWindowsコマンドを使用してください`;
            case 'darwin':
                return `## OS固有ヒント (macOS)
- パッケージマネージャ: brew
- ホームディレクトリ: /Users/
- システム情報: system_profiler
- シェル: /bin/zsh`;
            default:
                return `## OS固有ヒント (Linux)
- パッケージマネージャ: apt, yum, pacman
- ホームディレクトリ: /home/
- シェル: /bin/bash`;
        }
    }

    // プロジェクトの種類を自動検出する
    private async detectProjectInfo(cwd: string): Promise<string> {
        const info: string[] = [];

        // package.json の検出
        const pkgPath = path.join(cwd, 'package.json');
        if (await fileExists(pkgPath)) {
            try {
                const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
                info.push(`- プロジェクト名: ${pkg.name || '不明'}`);
                info.push(`- バージョン: ${pkg.version || '不明'}`);
                info.push(`- 種類: Node.js プロジェクト`);
                if (pkg.dependencies) {
                    const deps = Object.keys(pkg.dependencies).slice(0, 10).join(', ');
                    info.push(`- 主要な依存: ${deps}`);
                }
            } catch { /* 無視 */ }
        }

        // pyproject.toml の検出
        if (await fileExists(path.join(cwd, 'pyproject.toml'))) {
            info.push('- 種類: Python プロジェクト');
        }

        // Cargo.toml の検出
        if (await fileExists(path.join(cwd, 'Cargo.toml'))) {
            info.push('- 種類: Rust プロジェクト');
        }

        // go.mod の検出
        if (await fileExists(path.join(cwd, 'go.mod'))) {
            info.push('- 種類: Go プロジェクト');
        }

        // .git の検出
        if (await fileExists(path.join(cwd, '.git'))) {
            info.push('- Git リポジトリ: あり');
        }

        return info.length > 0 ? info.join('\n') : '- (プロジェクト情報なし)';
    }

    // メッセージを追加する
    addMessage(message: Message): void {
        this.messages.push(message);
        this.trimIfNeeded();
    }

    // メッセージ一覧を取得する（システムプロンプト込み）
    async getMessages(systemPrompt: string): Promise<Message[]> {
        return [
            { role: 'system', content: systemPrompt },
            ...this.messages,
        ];
    }

    // メッセージを直接設定する（セッション復元用）
    setMessages(messages: Message[]): void {
        this.messages = [...messages];
    }

    // 現在のメッセージ一覧を取得する（セッション保存用）
    getRawMessages(): Message[] {
        return [...this.messages];
    }

    // 会話履歴をクリアする
    clear(): void {
        this.messages = [];
    }

    // コンテキスト圧縮 — 古い会話を要約で置換する
    compact(): { before: number; after: number } {
        const before = this.messages.length;

        if (this.messages.length <= 4) {
            return { before, after: before };
        }

        // 最新4メッセージ以外を要約に置換
        const oldMessages = this.messages.slice(0, -4);
        const recentMessages = this.messages.slice(-4);

        // 古いメッセージの要約を生成
        const summary = oldMessages
            .filter(m => m.role !== 'system')
            .map(m => {
                const content = typeof m.content === 'string'
                    ? m.content.substring(0, 100)
                    : JSON.stringify(m.content).substring(0, 100);
                return `[${m.role}] ${content}`;
            })
            .join('\n');

        const summaryMessage: Message = {
            role: 'user',
            content: `[以下はこれまでの会話の要約です]\n${summary}\n[要約終了]`,
        };

        this.messages = [summaryMessage, ...recentMessages];

        return { before, after: this.messages.length };
    }

    // トークン数の推定値を取得する
    estimateTokenCount(): { tokens: number; maxTokens: number; percentage: number } {
        const totalChars = this.messages.reduce((sum, m) => {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return sum + content.length;
        }, 0);

        const tokens = Math.round(totalChars / 3);
        return {
            tokens,
            maxTokens: this.maxTokenEstimate,
            percentage: Math.round((tokens / this.maxTokenEstimate) * 100),
        };
    }

    // トークン数の推定に基づいて古いメッセージを削除する
    private trimIfNeeded(): void {
        let totalChars = this.messages.reduce((sum, m) => {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return sum + content.length;
        }, 0);

        const estimatedTokens = totalChars / 3;

        // 最大トークンの80%を超えたら古いメッセージを削除
        while (estimatedTokens > this.maxTokenEstimate * 0.8 && this.messages.length > 2) {
            this.messages.splice(0, 2);
            totalChars = this.messages.reduce((sum, m) => {
                const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                return sum + content.length;
            }, 0);
        }
    }

    // 現在のメッセージ数を取得
    get messageCount(): number {
        return this.messages.length;
    }
}
