# ShiningCode ✨ v1.0

最強のローカル動作AIコーディングエージェント — Ollama + TypeScript

## 概要

ShiningCodeは、Ollamaを使用してローカルで動作する高性能AIコーディングエージェントです。16種類の内蔵ツール＋MCP拡張により、ファイル操作、コマンド実行、Web検索、サブエージェント、タスク管理など、コーディング作業に必要な全機能を自然言語で操作できます。

## 特徴

- 🤖 **Ollama連携** — ローカルLLMによるプライバシー重視の動作（自動モデル選択対応）
- 🔧 **16+ツール** — ファイル操作、コマンド実行、Web検索、サブエージェント、タスク管理
- 💬 **対話型REPL** — マルチライン入力、ストリーミング対応
- 🔄 **エージェントループ** — Tool Callingによる自律的なタスク実行（最大25反復）
- 📋 **Plan/Actモード** — 安全な読み取り専用フェーズと実行フェーズの分離
- 🔀 **並列エージェント** — 最大4タスクの同時実行
- 💾 **セッション永続化** — JSONL形式でのセッション保存・再開
- 📂 **プロジェクト認識** — カレントディレクトリのプロジェクト構造を自動検出
- 🛡️ **セキュリティ保護** — 4段階の危険度レベル、システム保護パス、自動承認モード
- 🔗 **MCP連携** — Model Context Protocolで外部ツールを無制限に拡張
- 📝 **スキルシステム** — .mdファイルからカスタム指示を注入
- 🧪 **自動テストループ** — ファイル編集後の自動lint+テスト実行
- 🔍 **ファイル監視** — 外部エディタの変更を自動検出してLLMに通知
- ⏪ **Gitチェックポイント** — git stashベースの安全ネットで変更をロールバック可能

## 必要環境

- **Node.js** v18以降
- **Ollama** — [ollama.com](https://ollama.com) からインストール
- **推奨モデル**: `qwen3-coder:30b`

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
# 対話モード（デフォルト）
npm start

# ワンショットモード（1回だけ質問）
npm start -- -p "Pythonでじゃんけんゲーム作って"

# モデルを指定
npm start -- --model qwen2.5-coder:7b

# 自動承認モード（criticalレベル以外を自動承認）
npm start -- -y

# セッション再開
npm start -- --resume

# デバッグモード
npm start -- --debug
```

## CLIオプション

| オプション | 説明 |
|-----------|------|
| `--model, -m` | 使用するモデルを指定 |
| `--prompt, -p` | ワンショットモード |
| `--yes, -y` | 自動承認モード |
| `--resume` | 最新セッションを再開 |
| `--session-id <ID>` | 指定セッションを再開 |
| `--list-sessions` | セッション一覧 |
| `--debug` | デバッグログ |
| `--temperature` | LLM温度パラメータ |
| `--max-tokens` | 最大出力トークン数 |
| `--context-window` | コンテキストウィンドウサイズ |
| `--version` | バージョン表示 |
| `--check` | Ollama接続確認 |

## インタラクティブコマンド

### 基本
| コマンド | 説明 |
|---------|------|
| `/help` | ヘルプを表示 |
| `/clear` | 会話履歴をクリア |
| `/model [名前]` | モデルの表示・変更 |
| `/models` | モデルTier一覧 |
| `/tools` | ツール一覧 |
| `/status` | システム状態表示 |
| `/config` | 設定表示 |
| `/exit` | 終了 |

### セッション
| コマンド | 説明 |
|---------|------|
| `/save` | セッション保存 |
| `/compact` | コンテキスト圧縮 |
| `/tokens` | トークン使用量表示 |

### Plan/Actモード
| コマンド | 説明 |
|---------|------|
| `/plan` | Planモード（読み取り専用） |
| `/approve` | Actモードへ切替 |
| `/rollback` | チェックポイントに復元 |

### Git
| コマンド | 説明 |
|---------|------|
| `/checkpoint` | 手動チェックポイント |
| `/undo` | 最後の変更を取消 |
| `/commit [msg]` | Gitコミット |
| `/diff` | Git diff表示 |
| `/git <cmd>` | 任意のGitコマンド |

### 高度な機能
| コマンド | 説明 |
|---------|------|
| `/autotest` | 自動テストON/OFF |
| `/watch` | ファイル監視ON/OFF |
| `/skills` | スキル一覧 |
| `/mcp` | MCP接続状態 |
| `/init` | .shiningcode/ 初期化 |
| `/yes` | 自動承認モード |

## 利用可能なツール（16+）

### 基本I/O
| ツール | 説明 |
|--------|------|
| `read_file` | ファイル読み込み |
| `write_file` | ファイル作成・上書き 🛡️ |
| `edit_file` | 検索＆置換（リッチdiff） 🛡️ |
| `run_command` | コマンド実行（バックグラウンド対応） 🛡️ |
| `search_files` | ファイル名検索 |
| `grep_search` | 全文検索（正規表現対応） |
| `list_directory` | ディレクトリ一覧 |

### Web
| ツール | 説明 |
|--------|------|
| `web_fetch` | URL内容取得 |
| `web_search` | Web検索 |

### エージェント
| ツール | 説明 |
|--------|------|
| `sub_agent` | サブエージェント実行 |
| `parallel_agents` | 並列実行（最大4タスク） |

### タスク管理
| ツール | 説明 |
|--------|------|
| `task_create` | タスク作成 |
| `task_list` | タスク一覧 |
| `task_get` | タスク詳細 |
| `task_update` | タスク更新 |

### インタラクション
| ツール | 説明 |
|--------|------|
| `ask_user` | ユーザーに質問 |
| `notebook_edit` | Jupyter Notebook編集 |

> 🛡️ マークが付いたツールは実行前にユーザーの承認が必要です

## MCP連携

`.shiningcode/mcp.json` または `~/.config/shiningcode/mcp.json` にMCPサーバーを設定できます：

```json
{
  "mcpServers": {
    "my-server": {
      "command": "python3",
      "args": ["/path/to/mcp_server.py"],
      "env": {"API_KEY": "..."}
    }
  }
}
```

MCPツールは起動時に自動検出され `mcp_{server}_{tool}` 形式で登録されます。

## スキルシステム

`.md` ファイルを配置するとシステムプロンプトに自動注入されます：

```
~/.config/shiningcode/skills/   # グローバルスキル
.shiningcode/skills/             # プロジェクトスキル
```

## セキュリティ機能

- **ユーザー承認機構** — コマンド実行・ファイル操作前に確認
- **危険コマンド検出** — `format`, `rm -rf`, `shutdown` 等を検出し警告
- **4段階危険度レベル** — low / medium / high / critical
- **システム保護パス** — `C:\Windows`, `C:\Program Files` 等への書き込みをブロック
- **プロジェクト外警告** — 作業ディレクトリ外の操作時に追加警告
- **自動承認モード** — `-y` フラグでcritical以外を自動承認

## 技術スタック

- **言語**: TypeScript (Node.js)
- **LLM通信**: Ollama npm パッケージ
- **CLI**: chalk + readline
- **依存**: chalk, glob, ollama（3パッケージのみ）

## バージョン

v1.0.2

## ライセンス

MIT
