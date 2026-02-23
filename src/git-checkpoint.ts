// Gitチェックポイント & ロールバック — git stashベースの安全ネット
import { execSync } from 'child_process';
import chalk from 'chalk';

// チェックポイントのプレフィックス（識別用）
const CHECKPOINT_PREFIX = 'shiningcode-checkpoint';

// Gitリポジトリが存在するか確認する
export function isGitRepo(): boolean {
    try {
        execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

// チェックポイントを作成する（git stash）
export function createCheckpoint(label?: string): boolean {
    if (!isGitRepo()) {
        console.log(chalk.yellow('  ⚠ Gitリポジトリが見つかりません。チェックポイントをスキップします。'));
        return false;
    }

    try {
        // 未追跡ファイルも含めてstash
        const stashLabel = label
            ? `${CHECKPOINT_PREFIX}: ${label}`
            : `${CHECKPOINT_PREFIX}: ${new Date().toISOString()}`;

        // まずステージングに追加（未追跡ファイルを含めるため）
        execSync('git add -A', { stdio: 'pipe' });

        // 変更があるか確認
        const status = execSync('git status --porcelain', { stdio: 'pipe' }).toString().trim();
        if (!status) {
            console.log(chalk.dim('  ℹ 変更がないためチェックポイントは不要です。'));
            return true;
        }

        execSync(`git stash push -m "${stashLabel}"`, { stdio: 'pipe' });
        // stashした後、すぐにstash applyで元に戻す（チェックポイントとして保持）
        execSync('git stash apply', { stdio: 'pipe' });

        console.log(chalk.green(`  ✓ チェックポイントを作成しました: ${stashLabel}`));
        return true;
    } catch (err) {
        console.log(chalk.yellow(`  ⚠ チェックポイント作成に失敗: ${(err as Error).message}`));
        return false;
    }
}

// 最新のShiningCodeチェックポイントにロールバックする
export function rollbackToLastCheckpoint(): boolean {
    if (!isGitRepo()) {
        console.log(chalk.red('  ✗ Gitリポジトリが見つかりません。'));
        return false;
    }

    try {
        // stash一覧を取得
        const stashList = execSync('git stash list', { stdio: 'pipe' }).toString().trim();
        if (!stashList) {
            console.log(chalk.yellow('  ⚠ チェックポイントが見つかりません。'));
            return false;
        }

        // ShiningCodeのチェックポイントを探す
        const lines = stashList.split('\n');
        let targetStash: string | null = null;

        for (const line of lines) {
            if (line.includes(CHECKPOINT_PREFIX)) {
                // stash@{N} の形式からNを抽出
                const match = line.match(/stash@\{(\d+)\}/);
                if (match) {
                    targetStash = `stash@{${match[1]}}`;
                    break;
                }
            }
        }

        if (!targetStash) {
            console.log(chalk.yellow('  ⚠ ShiningCodeのチェックポイントが見つかりません。'));
            return false;
        }

        // 現在の変更を破棄してチェックポイントを適用
        execSync('git checkout -- .', { stdio: 'pipe' });
        execSync('git clean -fd', { stdio: 'pipe' });
        execSync(`git stash pop ${targetStash}`, { stdio: 'pipe' });

        console.log(chalk.green('  ✓ チェックポイントにロールバックしました。'));
        return true;
    } catch (err) {
        console.log(chalk.red(`  ✗ ロールバックに失敗: ${(err as Error).message}`));
        return false;
    }
}

// チェックポイント一覧を表示する
export function listCheckpoints(): void {
    if (!isGitRepo()) {
        console.log(chalk.red('  ✗ Gitリポジトリが見つかりません。'));
        return;
    }

    try {
        const stashList = execSync('git stash list', { stdio: 'pipe' }).toString().trim();
        if (!stashList) {
            console.log(chalk.dim('  チェックポイントはありません。'));
            return;
        }

        const lines = stashList.split('\n');
        let found = false;

        console.log(chalk.cyan('  チェックポイント一覧:'));
        for (const line of lines) {
            if (line.includes(CHECKPOINT_PREFIX)) {
                console.log(chalk.dim(`    ${line}`));
                found = true;
            }
        }

        if (!found) {
            console.log(chalk.dim('  ShiningCodeのチェックポイントはありません。'));
        }
    } catch {
        console.log(chalk.red('  ✗ チェックポイント一覧の取得に失敗しました。'));
    }
}

// Git diffを表示する
export function showGitDiff(): void {
    if (!isGitRepo()) {
        console.log(chalk.red('  ✗ Gitリポジトリが見つかりません。'));
        return;
    }

    try {
        const diff = execSync('git diff', { stdio: 'pipe' }).toString();
        const stagedDiff = execSync('git diff --staged', { stdio: 'pipe' }).toString();

        if (!diff && !stagedDiff) {
            console.log(chalk.dim('  変更はありません。'));
            return;
        }

        if (stagedDiff) {
            console.log(chalk.cyan('  ステージ済みの変更:'));
            console.log(stagedDiff);
        }
        if (diff) {
            console.log(chalk.cyan('  未ステージの変更:'));
            console.log(diff);
        }
    } catch {
        console.log(chalk.red('  ✗ Git diffの取得に失敗しました。'));
    }
}

// Git commitを実行する
export function gitCommit(message?: string): void {
    if (!isGitRepo()) {
        console.log(chalk.red('  ✗ Gitリポジトリが見つかりません。'));
        return;
    }

    try {
        execSync('git add -A', { stdio: 'pipe' });

        const status = execSync('git status --porcelain', { stdio: 'pipe' }).toString().trim();
        if (!status) {
            console.log(chalk.dim('  コミットする変更がありません。'));
            return;
        }

        const commitMsg = message || `feat: ShiningCode による自動コミット (${new Date().toISOString()})`;
        execSync(`git commit -m "${commitMsg}"`, { stdio: 'pipe' });
        console.log(chalk.green(`  ✓ コミットしました: ${commitMsg}`));
    } catch (err) {
        console.log(chalk.red(`  ✗ コミットに失敗: ${(err as Error).message}`));
    }
}

// 任意のgitコマンドを実行する
export function runGitCommand(cmd: string): string {
    if (!isGitRepo()) {
        return 'Gitリポジトリが見つかりません。';
    }

    try {
        return execSync(`git ${cmd}`, { stdio: 'pipe' }).toString();
    } catch (err) {
        return `Gitコマンドエラー: ${(err as Error).message}`;
    }
}
