// CLI — インタラクティブ REPL
import readline from 'readline';
import chalk from 'chalk';
import { OllamaClient } from './ollama-client';
import { ContextManager } from './context';
import type { AppConfig, Message } from './types';
import { getToolNames } from './tools/index';

export class CLI {
    private rl: readline.Interface;
    private client: OllamaClient;
    private context: ContextManager;
    private config: AppConfig;
    private systemPrompt: string = '';

    constructor(config: AppConfig) {
        this.config = config;
        this.client = new OllamaClient(config.host, config.model);
        this.context = new ContextManager(config.maxContextTokens);
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }

    // CLIを起動する
    async start(): Promise<void> {
        this.printBanner();

        // Ollamaサーバーへの接続確認
        const connected = await this.client.checkConnection();
        if (!connected) {
            console.log(chalk.red('\n❌ Ollamaサーバーに接続できません。'));
            console.log(chalk.yellow('   "ollama serve" でサーバーを起動してください。'));
            process.exit(1);
        }
        console.log(chalk.green('✓ Ollamaサーバーに接続しました'));

        // モデルの存在確認
        const models = await this.client.listModels();
        if (!models.some((m) => m.startsWith(this.config.model.split(':')[0]))) {
            console.log(chalk.yellow(`\n⚠ モデル "${this.config.model}" がダウンロードされていない可能性があります。`));
            console.log(chalk.yellow(`  "ollama pull ${this.config.model}" でダウンロードしてください。`));
        }
        console.log(chalk.green(`✓ モデル: ${this.config.model}`));

        // システムプロンプトの構築
        this.systemPrompt = await this.context.buildSystemPrompt();
        console.log(chalk.green('✓ プロジェクト情報を検出しました'));

        console.log(chalk.dim('\n  /help でコマンド一覧を表示 | Ctrl+C で終了\n'));

        // REPLループ開始
        this.prompt();
    }

    // プロンプトを表示してユーザー入力を待つ
    private prompt(): void {
        this.rl.question(chalk.cyan('❯ '), async (input) => {
            const trimmed = input.trim();
            if (!trimmed) {
                this.prompt();
                return;
            }

            // スラッシュコマンドの処理
            if (trimmed.startsWith('/')) {
                await this.handleCommand(trimmed);
                this.prompt();
                return;
            }

            // チャットメッセージの処理
            await this.handleChat(trimmed);
            this.prompt();
        });
    }

    // スラッシュコマンドを処理する
    private async handleCommand(input: string): Promise<void> {
        const [command, ...args] = input.split(' ');

        switch (command) {
            case '/help':
                this.printHelp();
                break;

            case '/clear':
                this.context.clear();
                console.log(chalk.green('✓ 会話履歴をクリアしました\n'));
                break;

            case '/model': {
                const newModel = args.join(' ').trim();
                if (!newModel) {
                    console.log(chalk.cyan(`現在のモデル: ${this.client.getModel()}`));
                    const models = await this.client.listModels();
                    if (models.length > 0) {
                        console.log(chalk.dim('利用可能なモデル:'));
                        models.forEach((m) => console.log(chalk.dim(`  - ${m}`)));
                    }
                } else {
                    this.client.setModel(newModel);
                    this.config.model = newModel;
                    console.log(chalk.green(`✓ モデルを "${newModel}" に変更しました\n`));
                }
                break;
            }

            case '/tools':
                console.log(chalk.cyan('利用可能なツール:'));
                getToolNames().forEach((name) => console.log(chalk.dim(`  - ${name}`)));
                console.log('');
                break;

            case '/exit':
            case '/quit':
                console.log(chalk.dim('さようなら！👋'));
                process.exit(0);

            default:
                console.log(chalk.yellow(`不明なコマンド: ${command}`));
                console.log(chalk.dim('/help でコマンド一覧を表示'));
                break;
        }
    }

    // チャットメッセージを処理する
    private async handleChat(input: string): Promise<void> {
        // ユーザーメッセージを履歴に追加
        const userMessage: Message = { role: 'user', content: input };
        this.context.addMessage(userMessage);

        // メッセージ一覧を構築
        const messages = await this.context.getMessages(this.systemPrompt);

        console.log(''); // 空行

        try {
            // ストリーミングチャット
            const assistantMessage = await this.client.chat(
                messages,
                // トークンの逐次表示
                (token) => {
                    process.stdout.write(chalk.white(token));
                },
                // ツール呼び出しの通知
                (toolName) => {
                    // logToolCallで表示されるので、ここでは何もしない
                }
            );

            console.log('\n'); // 応答後に改行

            // アシスタントの応答を履歴に追加
            this.context.addMessage(assistantMessage);
        } catch (err) {
            console.log(chalk.red(`\n\nエラー: ${(err as Error).message}\n`));
        }
    }

    // バナーを表示する
    private printBanner(): void {
        console.log('');
        console.log(chalk.bold.cyan('  ╔══════════════════════════════════════╗'));
        console.log(chalk.bold.cyan('  ║') + chalk.bold.white('     ✨ ShiningCode v0.2.1 ✨         ') + chalk.bold.cyan('║'));
        console.log(chalk.bold.cyan('  ║') + chalk.dim('  Ollamaベース コーディングアシスタント ') + chalk.bold.cyan('║'));
        console.log(chalk.bold.cyan('  ╚══════════════════════════════════════╝'));
        console.log('');
        console.log(chalk.dim(`  作業ディレクトリ: ${process.cwd()}`));
    }

    // ヘルプを表示する
    private printHelp(): void {
        console.log('');
        console.log(chalk.bold('コマンド一覧:'));
        console.log(chalk.cyan('  /help   ') + chalk.dim('— このヘルプを表示'));
        console.log(chalk.cyan('  /clear  ') + chalk.dim('— 会話履歴をクリア'));
        console.log(chalk.cyan('  /model  ') + chalk.dim('— モデルの表示・変更 (例: /model qwen2.5-coder:7b)'));
        console.log(chalk.cyan('  /tools  ') + chalk.dim('— 利用可能なツール一覧'));
        console.log(chalk.cyan('  /exit   ') + chalk.dim('— 終了'));
        console.log('');
        console.log(chalk.bold('使い方:'));
        console.log(chalk.dim('  自然言語で指示を入力してください。例:'));
        console.log(chalk.dim('  - 「このディレクトリの中身を見せて」'));
        console.log(chalk.dim('  - 「package.jsonを読んで」'));
        console.log(chalk.dim('  - 「hello.py というファイルを作って」'));
        console.log(chalk.dim('  - 「git status を実行して」'));
        console.log('');
    }
}
