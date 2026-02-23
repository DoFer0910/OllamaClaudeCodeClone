// Plan/Actモード管理 — 安全な読み取り専用フェーズと実行フェーズの分離
import chalk from 'chalk';
import type { PlanActMode } from './types';

// 読み取り専用ツール（Planモードで許可されるツール）
const READ_ONLY_TOOLS = new Set([
    'read_file',
    'search_files',
    'grep_search',
    'list_directory',
    'web_fetch',
    'web_search',
    'ask_user',
    'task_list',
    'task_get',
]);

// 現在のPlan/Actモードの状態
let _currentMode: PlanActMode = 'normal';

// 現在のモードを取得する
export function getCurrentMode(): PlanActMode {
    return _currentMode;
}

// Planモードに切り替える
export function enterPlanMode(): void {
    _currentMode = 'plan';
    console.log('');
    console.log(chalk.bgBlue.white.bold(' 📋 PLAN モード '));
    console.log(chalk.blue('  読み取り専用モードに入りました。'));
    console.log(chalk.blue('  ファイルの読み込み・検索のみ可能です。'));
    console.log(chalk.dim('  /approve または /act で実行モードに切り替えます。'));
    console.log('');
}

// Actモードに切り替える
export function enterActMode(): void {
    _currentMode = 'act';
    console.log('');
    console.log(chalk.bgGreen.white.bold(' 🚀 ACT モード '));
    console.log(chalk.green('  実行モードに切り替えました。全ツールが利用可能です。'));
    console.log(chalk.dim('  /rollback で変更を取り消せます。'));
    console.log('');
}

// 通常モードに戻す
export function exitPlanActMode(): void {
    _currentMode = 'normal';
}

// ツールがPlanモードで許可されているかチェックする
export function isToolAllowedInCurrentMode(toolName: string): boolean {
    if (_currentMode !== 'plan') {
        return true; // normalモードまたはactモードは全ツール許可
    }
    return READ_ONLY_TOOLS.has(toolName);
}

// Plan/Actモードの状態文字列を取得する
export function getModeStatusString(): string {
    switch (_currentMode) {
        case 'plan':
            return chalk.bgBlue.white(' PLAN ');
        case 'act':
            return chalk.bgGreen.white(' ACT ');
        default:
            return '';
    }
}
