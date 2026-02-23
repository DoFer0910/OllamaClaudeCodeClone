// コンテキスト管理 — 会話履歴とシステムプロンプトの管理
import fs from 'fs/promises';
import path from 'path';
import type { Message } from './types';
import { fileExists } from './utils';

export class ContextManager {
    private messages: Message[] = [];
    private maxTokenEstimate: number;

    constructor(maxTokens: number = 32768) {
        this.maxTokenEstimate = maxTokens;
    }

    // システムプロンプトを生成する（プロジェクト情報を自動付加）
    async buildSystemPrompt(): Promise<string> {
        const cwd = process.cwd();
        const projectInfo = await this.detectProjectInfo(cwd);

        return `あなたは「ShiningCode」— ローカルで動作する高性能コーディングアシスタントです。

## あなたの役割
- ユーザーのコーディング作業を支援する
- ファイルの読み書き、編集、コマンド実行、コード検索を行う
- 適切なツールを自動的に選択して使用する
- 日本語で回答する

## 利用可能なツール
1. **read_file** — ファイルの内容を読み込む
2. **write_file** — ファイルを作成または上書きする
3. **edit_file** — ファイルの一部を検索＆置換で編集する
4. **run_command** — シェルコマンドを実行する
5. **search_files** — ファイル名でプロジェクト内を検索する
6. **grep_search** — ファイル内容をテキストまたは正規表現で全文検索する
7. **list_directory** — ディレクトリの内容を一覧表示する

## 重要なルール
- **「cd」コマンドは絶対に使わないでください。** 各コマンドは独立したプロセスで実行されるため、cdでディレクトリを移動しても次のコマンドには反映されません。代わりに run_command の cwd パラメータを指定してください（例: run_command(command="npm init -y", cwd="test-project")）
- ファイルを作成・書き込みする際は、write_file の path にサブディレクトリを含めたパスを指定してください（例: write_file(path="test-project/src/index.js", content="...")）。cwdからの相対パスまたは絶対パスを使ってください
- ファイルを編集する前に、必ず先にread_fileで内容を確認してください
- edit_fileのsearchパラメータは、ファイル内の**実際のテキストと完全一致**させてください
- コマンド実行時はOSがWindowsであることを考慮してください（cmdコマンドを使用）
- 複雑な変更は段階的に行い、各ステップで説明してください
- ツールを使うべき場面では、必ずツールを呼び出してください。推測で回答しないでください

## セキュリティ
- **run_command、write_file、edit_file** はユーザーの承認が必要です。操作実行前に確認プロンプトが表示されます
- システム保護領域（C:\\Windows, C:\\Program Files 等）への書き込みはブロックされます
- 危険なコマンド（format, del /s, shutdown 等）は警告付きで表示されます
- プロジェクトディレクトリ外のファイル操作時は追加の警告が表示されます

## 現在のプロジェクト情報
- 作業ディレクトリ: ${cwd}
- OS: ${process.platform}
${projectInfo}
`;
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

    // 会話履歴をクリアする
    clear(): void {
        this.messages = [];
    }

    // トークン数の推定に基づいて古いメッセージを削除する
    private trimIfNeeded(): void {
        // 粗い推定: 1トークン ≈ 4文字（英語）/ 2文字（日本語）
        // 安全マージンとして3文字で計算
        let totalChars = this.messages.reduce((sum, m) => {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return sum + content.length;
        }, 0);

        const estimatedTokens = totalChars / 3;

        // 最大トークンの80%を超えたら古いメッセージを削除（システムプロンプト分の余裕を確保）
        while (estimatedTokens > this.maxTokenEstimate * 0.8 && this.messages.length > 2) {
            // 最初の2メッセージ（ユーザー＋アシスタント）を削除
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
