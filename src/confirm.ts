// ユーザー承認モジュール — 危険な操作実行前にユーザーの同意を求める
import readline from 'readline';
import chalk from 'chalk';

// auto-approve モードのグローバルフラグ
let _autoApprove = false;

// auto-approve モードを設定する
export function setAutoApprove(value: boolean): void {
    _autoApprove = value;
}

// auto-approve モードを取得する
export function getAutoApprove(): boolean {
    return _autoApprove;
}

// 操作の危険度レベル
export type DangerLevel = 'low' | 'medium' | 'high' | 'critical';

// 承認リクエストの型
export interface ConfirmRequest {
    // 操作の説明（例: 「ファイルを上書きします」）
    description: string;
    // 操作の詳細（例: ファイルパス、コマンド内容）
    details?: string;
    // 危険度レベル
    level: DangerLevel;
}

// 危険度に応じたカラーとラベルを取得
function getDangerStyle(level: DangerLevel): { color: (s: string) => string; label: string; icon: string } {
    switch (level) {
        case 'critical':
            return { color: chalk.bgRed.white.bold, label: '🚨 極めて危険', icon: '🚨' };
        case 'high':
            return { color: chalk.red.bold, label: '⚠️  危険', icon: '⚠️' };
        case 'medium':
            return { color: chalk.yellow, label: '⚡ 注意', icon: '⚡' };
        case 'low':
            return { color: chalk.cyan, label: 'ℹ️  確認', icon: 'ℹ️' };
    }
}

// ユーザーに操作の承認を求める
export async function confirmAction(request: ConfirmRequest): Promise<boolean> {
    // auto-approve モードの場合、criticalレベル以外は自動承認
    if (_autoApprove && request.level !== 'critical') {
        const style = getDangerStyle(request.level);
        console.log('');
        console.log(chalk.dim('─'.repeat(50)));
        console.log(style.color(` ${style.label} `) + chalk.green(' [自動承認]'));
        console.log(chalk.white(`  ${request.description}`));
        if (request.details) {
            console.log(chalk.dim(`  ${request.details}`));
        }
        console.log(chalk.dim('─'.repeat(50)));
        return true;
    }

    const style = getDangerStyle(request.level);

    console.log('');
    console.log(chalk.dim('─'.repeat(50)));
    console.log(style.color(` ${style.label} `));
    console.log(chalk.white(`  ${request.description}`));
    if (request.details) {
        console.log(chalk.dim(`  ${request.details}`));
    }
    console.log(chalk.dim('─'.repeat(50)));

    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const prompt = request.level === 'critical'
            ? chalk.red.bold('  実行しますか？ (yes/no): ')
            : chalk.yellow('  実行しますか？ (y/n): ');

        rl.question(prompt, (answer) => {
            rl.close();
            const trimmed = answer.trim().toLowerCase();

            // criticalレベルの場合は "yes" の完全入力が必要
            if (request.level === 'critical') {
                const approved = trimmed === 'yes';
                if (approved) {
                    console.log(chalk.green('  ✓ 承認されました'));
                } else {
                    console.log(chalk.red('  ✗ キャンセルされました'));
                }
                resolve(approved);
            } else {
                const approved = trimmed === 'y' || trimmed === 'yes';
                if (approved) {
                    console.log(chalk.green('  ✓ 承認されました'));
                } else {
                    console.log(chalk.red('  ✗ キャンセルされました'));
                }
                resolve(approved);
            }
        });
    });
}

// 危険コマンドの検出パターン（Windows / Linux 両対応）
const DANGEROUS_COMMAND_PATTERNS: { pattern: RegExp; reason: string }[] = [
    { pattern: /\bformat\s+[a-zA-Z]:/i, reason: 'ドライブのフォーマット' },
    { pattern: /\bdel\s+\/s/i, reason: 'ファイルの再帰的削除' },
    { pattern: /\brmdir\s+\/s/i, reason: 'ディレクトリの再帰的削除' },
    { pattern: /\brm\s+-r[f ]?\s*\//i, reason: 'ルートからの再帰的削除' },
    { pattern: /\brm\s+-rf\b/i, reason: '強制再帰的削除' },
    { pattern: /\bshutdown\b/i, reason: 'システムのシャットダウン' },
    { pattern: /\brestart\b/i, reason: 'システムの再起動' },
    { pattern: /\bmkfs\b/i, reason: 'ファイルシステムの作成（フォーマット）' },
    { pattern: /\bdd\s+if=/i, reason: 'ディスクの直接書き込み' },
    { pattern: /\breg\s+delete\b/i, reason: 'レジストリの削除' },
    { pattern: /\breg\s+add\b/i, reason: 'レジストリの変更' },
    { pattern: /\bnet\s+user\b/i, reason: 'ユーザーアカウントの操作' },
    { pattern: /\bnet\s+stop\b/i, reason: 'サービスの停止' },
    { pattern: /\btakeown\b/i, reason: 'ファイル所有権の変更' },
    { pattern: /\bicacls\b.*\/grant/i, reason: 'ファイル権限の変更' },
    { pattern: /\bpowershell\b.*-enc/i, reason: 'エンコードされたPowerShellの実行' },
    { pattern: /\bcurl\b.*\|\s*(bash|sh|powershell)/i, reason: 'リモートスクリプトのパイプ実行' },
    { pattern: /\bwget\b.*\|\s*(bash|sh|powershell)/i, reason: 'リモートスクリプトのパイプ実行' },
    { pattern: /\bnpm\s+publish\b/i, reason: 'パッケージの公開' },
    { pattern: /\bgit\s+push\s+.*--force\b/i, reason: 'Gitの強制プッシュ' },
];

// コマンドの危険度を判定する
export function assessCommandDanger(command: string): { level: DangerLevel; reasons: string[] } {
    const reasons: string[] = [];

    for (const { pattern, reason } of DANGEROUS_COMMAND_PATTERNS) {
        if (pattern.test(command)) {
            reasons.push(reason);
        }
    }

    if (reasons.length > 0) {
        // 特に危険なパターンの場合は critical
        const isCritical = reasons.some(r =>
            r.includes('フォーマット') || r.includes('ルートから') || r.includes('シャットダウン') || r.includes('ディスクの直接')
        );
        return { level: isCritical ? 'critical' : 'high', reasons };
    }

    // すべてのコマンドは少なくとも low レベルで承認を求める
    return { level: 'low', reasons: [] };
}

// システム保護パス（これらの配下への書き込み/編集を禁止）
const PROTECTED_PATHS_WINDOWS = [
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\ProgramData',
];
const PROTECTED_PATHS_UNIX = [
    '/etc', '/usr', '/bin', '/sbin', '/boot', '/sys', '/proc', '/lib',
];

// パスがシステム保護領域内かどうか判定する
export function isProtectedPath(filePath: string): boolean {
    const normalized = filePath.replace(/\//g, '\\');
    const protectedPaths = process.platform === 'win32' ? PROTECTED_PATHS_WINDOWS : PROTECTED_PATHS_UNIX;

    for (const protPath of protectedPaths) {
        const normalizedProt = protPath.replace(/\//g, '\\');
        if (normalized.toLowerCase().startsWith(normalizedProt.toLowerCase())) {
            return true;
        }
    }
    return false;
}

// パスがプロジェクトディレクトリ外かどうか判定する
export function isOutsideProject(filePath: string): boolean {
    const cwd = process.cwd();
    const normalizedPath = filePath.replace(/\//g, '\\').toLowerCase();
    const normalizedCwd = cwd.replace(/\//g, '\\').toLowerCase();
    return !normalizedPath.startsWith(normalizedCwd);
}
