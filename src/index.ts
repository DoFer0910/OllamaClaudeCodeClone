#!/usr/bin/env node
// メインエントリポイント — CLI引数の解析と起動（v1.0）
import { CLI } from './cli';
import { DEFAULT_CONFIG } from './types';
import type { AppConfig } from './types';
import { listSessions } from './session';
import { setAutoApprove } from './confirm';
import chalk from 'chalk';

// CLI引数を解析する
function parseArgs(args: string[]): Partial<AppConfig> & { help?: boolean; check?: boolean; listSessions?: boolean; version?: boolean } {
    const result: Partial<AppConfig> & { help?: boolean; check?: boolean; listSessions?: boolean; version?: boolean } = {};

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--model':
            case '-m':
                result.model = args[++i];
                break;
            case '--host':
            case '-h':
                result.host = args[++i];
                break;
            case '--help':
                result.help = true;
                break;
            case '--check':
                result.check = true;
                break;
            // v1.0 新規フラグ
            case '--prompt':
            case '-p':
                result.prompt = args[++i];
                break;
            case '--yes':
            case '-y':
                result.autoApprove = true;
                break;
            case '--resume':
                result.resume = true;
                break;
            case '--session-id':
                result.sessionId = args[++i];
                break;
            case '--list-sessions':
                result.listSessions = true;
                break;
            case '--debug':
                result.debug = true;
                break;
            case '--temperature':
                result.temperature = parseFloat(args[++i]);
                break;
            case '--context-window':
                result.contextWindow = parseInt(args[++i]);
                break;
            case '--max-tokens':
                result.maxTokens = parseInt(args[++i]);
                break;
            case '--version':
                result.version = true;
                break;
            default:
                // 不明なオプションは無視
                break;
        }
    }

    return result;
}

// ヘルプメッセージを表示する
function showHelp(): void {
    console.log(`
${chalk.bold('ShiningCode v1.0')} — 最強のローカル動作AIコーディングエージェント

${chalk.bold('使い方:')}
  npx tsx src/index.ts [オプション]

${chalk.bold('オプション:')}
  --model, -m <モデル名>    使用するモデルを指定 (デフォルト: ${DEFAULT_CONFIG.model})
  --host, -h <URL>          Ollamaサーバーのホスト (デフォルト: ${DEFAULT_CONFIG.host})
  --prompt, -p <テキスト>   ワンショットモード（1回だけ質問して終了）
  --yes, -y                 自動承認モード（criticalレベル以外を自動承認）
  --resume                  最新セッションを再開
  --session-id <ID>         指定したセッションを再開
  --list-sessions           セッション一覧を表示
  --debug                   デバッグログを有効化
  --temperature <値>        LLMの温度パラメータ (デフォルト: ${DEFAULT_CONFIG.temperature})
  --context-window <値>     コンテキストウィンドウサイズ (デフォルト: ${DEFAULT_CONFIG.contextWindow})
  --max-tokens <値>         最大出力トークン数 (デフォルト: ${DEFAULT_CONFIG.maxTokens})
  --check                   Ollamaサーバーへの接続確認のみ実行
  --version                 バージョン表示
  --help                    このヘルプを表示

${chalk.bold('例:')}
  npx tsx src/index.ts
  npx tsx src/index.ts --model qwen2.5-coder:7b
  npx tsx src/index.ts -p "Pythonでじゃんけんゲーム作って"
  npx tsx src/index.ts -y --resume
`);
}

// メイン処理
async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));

    // バージョン表示
    if (args.version) {
        console.log('ShiningCode v1.0.0');
        process.exit(0);
    }

    // ヘルプ表示
    if (args.help) {
        showHelp();
        process.exit(0);
    }

    // セッション一覧表示
    if (args.listSessions) {
        const sessions = await listSessions();
        if (sessions.length === 0) {
            console.log(chalk.dim('セッションが見つかりません。'));
        } else {
            console.log(chalk.bold('\nセッション一覧:'));
            for (const s of sessions) {
                console.log(chalk.cyan(`  ${s.id}`) + chalk.dim(` (${s.model}, ${s.messageCount}メッセージ, ${s.createdAt})`));
            }
        }
        process.exit(0);
    }

    // 設定を構築
    const config: AppConfig = {
        ...DEFAULT_CONFIG,
        ...(args.model && { model: args.model }),
        ...(args.host && { host: args.host }),
        ...(args.prompt !== undefined && { prompt: args.prompt }),
        ...(args.autoApprove !== undefined && { autoApprove: args.autoApprove }),
        ...(args.resume !== undefined && { resume: args.resume }),
        ...(args.sessionId !== undefined && { sessionId: args.sessionId }),
        ...(args.debug !== undefined && { debug: args.debug }),
        ...(args.temperature !== undefined && { temperature: args.temperature }),
        ...(args.contextWindow !== undefined && { contextWindow: args.contextWindow }),
        ...(args.maxTokens !== undefined && { maxTokens: args.maxTokens }),
    };

    // auto-approve モードを設定
    if (config.autoApprove) {
        setAutoApprove(true);
    }

    // 接続チェックモード
    if (args.check) {
        const { OllamaClient } = await import('./ollama-client.js');
        const client = new OllamaClient(config.host, config.model);
        const connected = await client.checkConnection();
        if (connected) {
            console.log(chalk.green('✓ Ollamaサーバーに接続できました'));
            const models = await client.listModels();
            console.log(chalk.dim(`利用可能なモデル: ${models.join(', ')}`));
            process.exit(0);
        } else {
            console.log(chalk.red('✗ Ollamaサーバーに接続できません'));
            process.exit(1);
        }
    }

    // CLIを起動
    const cli = new CLI(config);
    await cli.start();
}

// エラーハンドリング
main().catch((err) => {
    console.error(chalk.red(`致命的なエラー: ${err.message}`));
    process.exit(1);
});
