# ShiningCode ✨

Ollamaベースのローカル動作CLIコーディングアシスタント

## 概要

ShiningCodeは、Ollamaを使用してローカルで動作するClaude Code風のCLIコーディングアシスタントです。ファイルの読み書き、編集、コマンド実行、コード検索など、コーディング作業に必要な機能を自然言語で操作できます。

## 特徴

- 🤖 **Ollama連携** — ローカルLLMによるプライバシー重視の動作
- 🔧 **7種のツール** — ファイル操作、コマンド実行、コード検索
- 💬 **対話型REPL** — ストリーミングレスポンスによるリアルタイムチャット
- 🔄 **エージェントループ** — Tool Callingによる自律的なタスク実行
- 📂 **プロジェクト認識** — カレントディレクトリのプロジェクト構造を自動検出
- 🛡️ **セキュリティ保護** — 危険な操作の実行前にユーザー承認を要求

## 必要環境

- **Node.js** v18以降
- **Ollama** — [ollama.com](https://ollama.com) からインストール
- **推奨モデル**: `qwen3-coder:30b`（RTX 4060 Ti 8GB VRAMで動作）

## セットアップ

```bash
# 依存パッケージのインストール
npm install

# Ollamaでモデルをダウンロード
ollama pull qwen3-coder:30b

# Ollamaサーバーを起動（別ターミナル）
ollama serve
```

## 使い方

```bash
# 起動
npm start

# モデルを指定して起動
npx tsx src/index.ts --model qwen2.5-coder:7b

# Ollamaサーバーの接続確認
npx tsx src/index.ts --check
```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `/help` | ヘルプを表示 |
| `/clear` | 会話履歴をクリア |
| `/model [名前]` | モデルの表示・変更 |
| `/tools` | 利用可能なツール一覧 |
| `/exit` | 終了 |

## 利用可能なツール

| ツール | 説明 |
|--------|------|
| `read_file` | ファイル内容の読み込み（行番号指定対応） |
| `write_file` | ファイルの新規作成・上書き 🛡️ |
| `edit_file` | 既存ファイルの部分編集（検索＆置換） 🛡️ |
| `run_command` | シェルコマンドの実行 🛡️ |
| `search_files` | ファイル名でプロジェクト内を検索 |
| `grep_search` | ファイル内容の全文検索（正規表現対応） |
| `list_directory` | ディレクトリの内容一覧表示 |

> 🛡️ マークが付いたツールは実行前にユーザーの承認が必要です

## セキュリティ機能

ShiningCode v0.3.0 では以下のセキュリティ機能を備えています：

- **ユーザー承認機構** — コマンド実行・ファイル書き込み・ファイル編集前に `y/n` で確認
- **危険コマンド検出** — `format`, `del /s`, `rm -rf`, `shutdown` 等を検出し警告
- **システム保護パス** — `C:\Windows`, `C:\Program Files` 等への書き込みをブロック
- **プロジェクト外警告** — 作業ディレクトリ外のファイル操作時に追加警告
- **危険度レベル** — 4段階（low / medium / high / critical）で操作の危険度を表示

## 技術スタック

- **言語**: TypeScript (Node.js)
- **LLM通信**: Ollama npm パッケージ
- **CLI**: chalk + readline

## バージョン

v0.3.0

## ライセンス

MIT
