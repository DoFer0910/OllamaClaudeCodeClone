// CLI — インタラクティブ REPL（v1.0 フル機能版）
import readline from 'readline';
import chalk from 'chalk';
import { OllamaClient } from './ollama-client';
import { ContextManager } from './context';
import type { AppConfig, Message } from './types';
import { getToolNames, getToolCount, registerTool } from './tools/index';
import { generateSessionId, saveSession, loadSession, getLatestSessionId } from './session';
import { enterPlanMode, enterActMode, exitPlanActMode, getCurrentMode, getModeStatusString } from './plan-act';
import { createCheckpoint, rollbackToLastCheckpoint, listCheckpoints, showGitDiff, gitCommit, runGitCommand } from './git-checkpoint';
import { toggleAutoTest, isAutoTestEnabled, runAutoTests, formatTestResultsForLLM } from './auto-test';
import { FileWatcher, formatFileChangesForLLM } from './file-watcher';
import { printSkillsList } from './skills';
import { initializeMCP, closeMCP, printMCPStatus } from './mcp-client';
import { setSubAgentRunner } from './tools/sub-agent';
import { setParallelAgentRunner } from './tools/parallel-agents';
import { setAutoApprove, getAutoApprove } from './confirm';

export class CLI {
    private rl: readline.Interface;
    private client: OllamaClient;
    private context: ContextManager;
    private config: AppConfig;
    private systemPrompt: string = '';
    private sessionId: string;
    private fileWatcher: FileWatcher;
    private multilineBuffer: string[] | null = null;

    constructor(config: AppConfig) {
        this.config = config;
        this.client = new OllamaClient(config.host, config.model, {
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            debug: config.debug,
        });
        this.context = new ContextManager(config.maxContextTokens);
        this.sessionId = config.sessionId || generateSessionId();
        this.fileWatcher = new FileWatcher();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        // サブエージェントのランナーを設定
        const subAgentRunner = async (prompt: string): Promise<string> => {
            return this.client.simpleChat(prompt, this.systemPrompt);
        };
        setSubAgentRunner(subAgentRunner);
        setParallelAgentRunner(subAgentRunner);
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

        // モデルの存在確認（自動選択対応）
        const models = await this.client.listModels();
        if (!models.some((m) => m.startsWith(this.config.model.split(':')[0]))) {
            console.log(chalk.yellow(`\n⚠ モデル "${this.config.model}" がダウンロードされていない可能性があります。`));
            // 自動モデル選択を試みる
            const best = await this.client.autoSelectModel();
            if (best) {
                console.log(chalk.green(`  → 利用可能な最良モデルを自動選択: ${best}`));
                this.client.setModel(best);
                this.config.model = best;
            } else {
                console.log(chalk.yellow(`  "ollama pull ${this.config.model}" でダウンロードしてください。`));
            }
        }
        console.log(chalk.green(`✓ モデル: ${this.config.model}`));

        // MCP初期化
        try {
            const mcpTools = await initializeMCP();
            for (const tool of mcpTools) {
                const toolDef = tool.definition.function as { name: string };
                registerTool(toolDef.name, tool);
            }
            if (mcpTools.length > 0) {
                console.log(chalk.green(`✓ MCPツール: ${mcpTools.length}個登録`));
            }
        } catch { /* MCP初期化失敗は無視 */ }

        // システムプロンプトの構築
        this.systemPrompt = await this.context.buildSystemPrompt();
        console.log(chalk.green('✓ プロジェクト情報を検出しました'));

        // auto-approve表示
        if (this.config.autoApprove) {
            console.log(chalk.yellow('⚡ 自動承認モード (criticalレベル以外)'));
        }

        // セッション復元
        if (this.config.resume || this.config.sessionId) {
            const sid = this.config.sessionId || await getLatestSessionId();
            if (sid) {
                const session = await loadSession(sid);
                if (session) {
                    this.sessionId = session.id;
                    this.context.setMessages(session.messages);
                    console.log(chalk.green(`✓ セッション復元: ${sid} (${session.messages.length}メッセージ)`));
                }
            }
        }

        console.log(chalk.dim(`  セッションID: ${this.sessionId}`));
        console.log(chalk.dim(`  ツール: ${getToolCount()}個`));
        console.log(chalk.dim('\n  /help でコマンド一覧を表示 | Ctrl+C で終了\n'));

        // ワンショットモード
        if (this.config.prompt) {
            await this.handleChat(this.config.prompt);
            await this.saveCurrentSession();
            process.exit(0);
        }

        // REPLループ開始
        this.prompt();
    }

    // プロンプトを表示してユーザー入力を待つ
    private prompt(): void {
        const modeStr = getModeStatusString();
        const promptStr = modeStr
            ? `${modeStr} ${chalk.cyan('❯ ')}`
            : chalk.cyan('❯ ');

        this.rl.question(promptStr, async (input) => {
            const trimmed = input.trim();

            // マルチライン入力の開始/終了
            if (trimmed === '"""') {
                if (this.multilineBuffer === null) {
                    this.multilineBuffer = [];
                    console.log(chalk.dim('  マルチライン入力（"""で終了）'));
                    this.prompt();
                    return;
                } else {
                    const fullInput = this.multilineBuffer.join('\n');
                    this.multilineBuffer = null;
                    if (fullInput.trim()) {
                        await this.handleChat(fullInput);
                    }
                    this.prompt();
                    return;
                }
            }

            // マルチライン入力中
            if (this.multilineBuffer !== null) {
                this.multilineBuffer.push(input);
                this.prompt();
                return;
            }

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

            // exit/quit/bye
            if (['exit', 'quit', 'bye'].includes(trimmed.toLowerCase())) {
                await this.saveCurrentSession();
                console.log(chalk.dim('さようなら！👋'));
                closeMCP();
                process.exit(0);
            }

            // チャットメッセージの処理
            await this.handleChat(trimmed);
            this.prompt();
        });
    }

    // スラッシュコマンドを処理する
    private async handleCommand(input: string): Promise<void> {
        const parts = input.split(' ');
        const command = parts[0];
        const args = parts.slice(1);

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

            case '/models': {
                const tiers = await this.client.listModelsWithTiers();
                console.log(chalk.cyan('\nモデルTier一覧:'));
                const tierColors = { S: chalk.red, A: chalk.yellow, B: chalk.green, C: chalk.dim };
                for (const t of tiers) {
                    const color = tierColors[t.tier as keyof typeof tierColors] || chalk.white;
                    const installed = t.installed ? chalk.green(' ✓') : chalk.dim(' ✗');
                    console.log(`  ${color(`[${t.tier}]`)} ${t.name}${installed}`);
                }
                console.log('');
                break;
            }

            case '/tools':
                console.log(chalk.cyan(`利用可能なツール (${getToolCount()}個):`));
                getToolNames().forEach((name) => console.log(chalk.dim(`  - ${name}`)));
                console.log('');
                break;

            case '/status': {
                const mode = getCurrentMode();
                const tokens = this.context.estimateTokenCount();
                const autoTest = isAutoTestEnabled();
                const watcher = this.fileWatcher.isEnabled();
                const autoApprove = getAutoApprove();

                console.log(chalk.cyan('\nシステム状態:'));
                console.log(chalk.dim(`  モデル: ${this.config.model}`));
                console.log(chalk.dim(`  セッション: ${this.sessionId}`));
                console.log(chalk.dim(`  モード: ${mode}`));
                console.log(chalk.dim(`  メッセージ数: ${this.context.messageCount}`));
                console.log(chalk.dim(`  トークン: ${tokens.tokens} / ${tokens.maxTokens} (${tokens.percentage}%)`));
                console.log(chalk.dim(`  自動承認: ${autoApprove ? 'ON' : 'OFF'}`));
                console.log(chalk.dim(`  自動テスト: ${autoTest ? 'ON' : 'OFF'}`));
                console.log(chalk.dim(`  ファイル監視: ${watcher ? 'ON' : 'OFF'}`));
                console.log(chalk.dim(`  ツール数: ${getToolCount()}`));
                console.log('');
                break;
            }

            case '/save':
                await this.saveCurrentSession();
                console.log(chalk.green(`✓ セッションを保存しました: ${this.sessionId}\n`));
                break;

            case '/compact': {
                const result = this.context.compact();
                console.log(chalk.green(`✓ コンテキストを圧縮しました: ${result.before} → ${result.after}メッセージ\n`));
                break;
            }

            case '/tokens': {
                const t = this.context.estimateTokenCount();
                const bar = '█'.repeat(Math.round(t.percentage / 5)) + '░'.repeat(20 - Math.round(t.percentage / 5));
                console.log(chalk.cyan(`\n  トークン使用量: ${t.tokens} / ${t.maxTokens}`));
                console.log(chalk.dim(`  [${bar}] ${t.percentage}%\n`));
                break;
            }

            case '/undo':
                rollbackToLastCheckpoint();
                console.log('');
                break;

            case '/config':
                console.log(chalk.cyan('\n設定:'));
                console.log(chalk.dim(`  model: ${this.config.model}`));
                console.log(chalk.dim(`  host: ${this.config.host}`));
                console.log(chalk.dim(`  temperature: ${this.config.temperature}`));
                console.log(chalk.dim(`  maxTokens: ${this.config.maxTokens}`));
                console.log(chalk.dim(`  contextWindow: ${this.config.contextWindow}`));
                console.log(chalk.dim(`  autoApprove: ${this.config.autoApprove}`));
                console.log(chalk.dim(`  debug: ${this.config.debug}`));
                console.log('');
                break;

            case '/commit': {
                const msg = args.join(' ').trim() || undefined;
                gitCommit(msg);
                console.log('');
                break;
            }

            case '/diff':
                showGitDiff();
                console.log('');
                break;

            case '/git': {
                const gitCmd = args.join(' ').trim();
                if (!gitCmd) {
                    console.log(chalk.dim('  使い方: /git <コマンド> (例: /git status)'));
                } else {
                    const output = runGitCommand(gitCmd);
                    console.log(output);
                }
                break;
            }

            case '/plan':
                createCheckpoint('Plan/Actモード開始');
                enterPlanMode();
                break;

            case '/approve':
            case '/act':
                createCheckpoint('Plan→Act切替');
                enterActMode();
                break;

            case '/checkpoint':
                createCheckpoint('手動チェックポイント');
                console.log('');
                break;

            case '/rollback':
                rollbackToLastCheckpoint();
                exitPlanActMode();
                console.log('');
                break;

            case '/autotest': {
                const enabled = toggleAutoTest();
                console.log(chalk.green(`✓ 自動テスト: ${enabled ? 'ON' : 'OFF'}\n`));
                break;
            }

            case '/watch': {
                const watchEnabled = this.fileWatcher.toggle();
                console.log('');
                break;
            }

            case '/skills':
                await printSkillsList();
                console.log('');
                break;

            case '/mcp':
                printMCPStatus();
                console.log('');
                break;

            case '/init':
                console.log(chalk.cyan('プロジェクト初期化:'));
                console.log(chalk.dim('  .shiningcode/ ディレクトリを作成しています...'));
                try {
                    const fsModule = await import('fs/promises');
                    await fsModule.default.mkdir('.shiningcode/skills', { recursive: true });
                    await fsModule.default.mkdir('.shiningcode', { recursive: true });
                    console.log(chalk.green('  ✓ .shiningcode/ を作成しました'));
                    console.log(chalk.dim('  スキルファイル: .shiningcode/skills/*.md'));
                    console.log(chalk.dim('  MCP設定: .shiningcode/mcp.json'));
                } catch (err) {
                    console.log(chalk.red(`  ✗ 初期化失敗: ${(err as Error).message}`));
                }
                console.log('');
                break;

            case '/yes':
                setAutoApprove(true);
                console.log(chalk.yellow('⚡ 次の操作から自動承認モードになりました\n'));
                break;

            case '/exit':
            case '/quit':
            case '/q':
                await this.saveCurrentSession();
                console.log(chalk.dim('さようなら！👋'));
                closeMCP();
                process.exit(0);

            default:
                console.log(chalk.yellow(`不明なコマンド: ${command}`));
                console.log(chalk.dim('/help でコマンド一覧を表示'));
                break;
        }
    }

    // チャットメッセージを処理する
    private async handleChat(input: string): Promise<void> {
        // ファイル監視の変更を挿入
        if (this.fileWatcher.isEnabled()) {
            const changes = this.fileWatcher.consumeChanges();
            if (changes.length > 0) {
                const note = formatFileChangesForLLM(changes);
                console.log(chalk.dim(note));
                input = note + '\n\n' + input;
            }
        }

        // ユーザーメッセージを履歴に追加
        const userMessage: Message = { role: 'user', content: input };
        this.context.addMessage(userMessage);

        // メッセージ一覧を構築
        const messages = await this.context.getMessages(this.systemPrompt);

        console.log(''); // 空行

        try {
            // チャット実行
            const assistantMessage = await this.client.chat(
                messages,
                (token) => {
                    process.stdout.write(chalk.white(token));
                },
                (toolName) => {
                    // ツール呼び出しはログで表示される
                }
            );

            console.log('\n'); // 応答後に改行

            // アシスタントの応答を履歴に追加
            this.context.addMessage(assistantMessage);

            // 自動テスト実行
            if (isAutoTestEnabled()) {
                const testResults = await runAutoTests();
                const feedback = formatTestResultsForLLM(testResults);
                if (feedback) {
                    // テスト失敗をLLMにフィードバック
                    console.log(chalk.yellow('  テスト失敗を検出。自動修正を試みます...'));
                    const feedbackMessage: Message = { role: 'user', content: feedback };
                    this.context.addMessage(feedbackMessage);

                    const fixMessages = await this.context.getMessages(this.systemPrompt);
                    const fixResponse = await this.client.chat(
                        fixMessages,
                        (token) => process.stdout.write(chalk.white(token)),
                    );
                    console.log('\n');
                    this.context.addMessage(fixResponse);
                }
            }

            // セッション自動保存（5メッセージごと）
            if (this.context.messageCount % 5 === 0) {
                await this.saveCurrentSession();
            }
        } catch (err) {
            console.log(chalk.red(`\n\nエラー: ${(err as Error).message}\n`));
        }
    }

    // 現在のセッションを保存する
    private async saveCurrentSession(): Promise<void> {
        try {
            await saveSession({
                id: this.sessionId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                model: this.config.model,
                cwd: process.cwd(),
                messages: this.context.getRawMessages(),
            });
        } catch { /* セッション保存失敗は無視 */ }
    }

    // バナーを表示する
    private printBanner(): void {
        console.log('');
        console.log(chalk.bold.cyan('  ╔══════════════════════════════════════════╗'));
        console.log(chalk.bold.cyan('  ║') + chalk.bold.white('      ✨ ShiningCode v1.0.0 ✨           ') + chalk.bold.cyan('║'));
        console.log(chalk.bold.cyan('  ║') + chalk.dim('  最強のローカルAIコーディングエージェント ') + chalk.bold.cyan('║'));
        console.log(chalk.bold.cyan('  ╚══════════════════════════════════════════╝'));
        console.log('');
        console.log(chalk.dim(`  作業ディレクトリ: ${process.cwd()}`));
    }

    // ヘルプを表示する
    private printHelp(): void {
        console.log('');
        console.log(chalk.bold('基本コマンド:'));
        console.log(chalk.cyan('  /help     ') + chalk.dim('— このヘルプを表示'));
        console.log(chalk.cyan('  /clear    ') + chalk.dim('— 会話履歴をクリア'));
        console.log(chalk.cyan('  /model    ') + chalk.dim('— モデルの表示・変更'));
        console.log(chalk.cyan('  /models   ') + chalk.dim('— モデルTier一覧'));
        console.log(chalk.cyan('  /tools    ') + chalk.dim('— ツール一覧'));
        console.log(chalk.cyan('  /status   ') + chalk.dim('— システム状態'));
        console.log(chalk.cyan('  /config   ') + chalk.dim('— 設定表示'));
        console.log(chalk.cyan('  /exit     ') + chalk.dim('— 終了'));
        console.log('');
        console.log(chalk.bold('セッション:'));
        console.log(chalk.cyan('  /save     ') + chalk.dim('— セッションを保存'));
        console.log(chalk.cyan('  /compact  ') + chalk.dim('— コンテキストを圧縮'));
        console.log(chalk.cyan('  /tokens   ') + chalk.dim('— トークン使用量'));
        console.log('');
        console.log(chalk.bold('Plan/Actモード:'));
        console.log(chalk.cyan('  /plan     ') + chalk.dim('— Planモード（読み取り専用）'));
        console.log(chalk.cyan('  /approve  ') + chalk.dim('— Actモード（全ツール有効）'));
        console.log(chalk.cyan('  /rollback ') + chalk.dim('— チェックポイントに戻る'));
        console.log('');
        console.log(chalk.bold('Git:'));
        console.log(chalk.cyan('  /checkpoint') + chalk.dim('— チェックポイント作成'));
        console.log(chalk.cyan('  /undo     ') + chalk.dim('— 最後の変更を取消'));
        console.log(chalk.cyan('  /commit   ') + chalk.dim('— Gitコミット'));
        console.log(chalk.cyan('  /diff     ') + chalk.dim('— Git diff表示'));
        console.log(chalk.cyan('  /git <cmd>') + chalk.dim('— 任意のGitコマンド'));
        console.log('');
        console.log(chalk.bold('高度な機能:'));
        console.log(chalk.cyan('  /autotest ') + chalk.dim('— 自動テストON/OFF'));
        console.log(chalk.cyan('  /watch    ') + chalk.dim('— ファイル監視ON/OFF'));
        console.log(chalk.cyan('  /skills   ') + chalk.dim('— スキル一覧'));
        console.log(chalk.cyan('  /mcp      ') + chalk.dim('— MCP接続状態'));
        console.log(chalk.cyan('  /init     ') + chalk.dim('— .shiningcode/ 初期化'));
        console.log(chalk.cyan('  /yes      ') + chalk.dim('— 自動承認モード'));
        console.log('');
        console.log(chalk.bold('入力:'));
        console.log(chalk.dim('  """       — マルチライン入力開始/終了'));
        console.log(chalk.dim('  exit      — 終了（/exit と同じ）'));
        console.log('');
    }
}
