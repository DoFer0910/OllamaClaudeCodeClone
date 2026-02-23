#!/usr/bin/env node
// メインエントリポイント — CLI引数の解析と起動
import { CLI } from './cli';
import { DEFAULT_CONFIG } from './types';
import type { AppConfig } from './types';
import chalk from 'chalk';

// CLI引数を解析する
function parseArgs(args: string[]): Partial<AppConfig> & { help?: boolean; check?: boolean } {
    const result: Partial<AppConfig> & { help?: boolean; check?: boolean } = {};

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
${chalk.bold('ShiningCode')} — Ollamaベースのローカル動作CLIコーディングアシスタント

${chalk.bold('使い方:')}
  npx tsx src/index.ts [オプション]

${chalk.bold('オプション:')}
  --model, -m <モデル名>  使用するモデルを指定 (デフォルト: ${DEFAULT_CONFIG.model})
  --host, -h <URL>        Ollamaサーバーのホスト (デフォルト: ${DEFAULT_CONFIG.host})
  --check                 Ollamaサーバーへの接続確認のみ実行
  --help                  このヘルプを表示

${chalk.bold('例:')}
  npx tsx src/index.ts
  npx tsx src/index.ts --model qwen2.5-coder:7b
  npx tsx src/index.ts --host http://192.168.1.100:11434
`);
}

// メイン処理
async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));

    // ヘルプ表示
    if (args.help) {
        showHelp();
        process.exit(0);
    }

    // 設定を構築
    const config: AppConfig = {
        ...DEFAULT_CONFIG,
        ...(args.model && { model: args.model }),
        ...(args.host && { host: args.host }),
    };

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
