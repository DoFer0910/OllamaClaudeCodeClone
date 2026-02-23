// 自動テストループ — ファイル編集後の自動lint+テスト実行
import { execSync } from 'child_process';
import path from 'path';
import chalk from 'chalk';
import { fileExists } from './utils';

// 自動テストの有効/無効フラグ
let _autoTestEnabled = false;

// 自動テストのON/OFFを切り替える
export function toggleAutoTest(): boolean {
    _autoTestEnabled = !_autoTestEnabled;
    return _autoTestEnabled;
}

// 自動テストが有効かどうか取得する
export function isAutoTestEnabled(): boolean {
    return _autoTestEnabled;
}

// テスト結果の型
export interface TestResult {
    passed: boolean;
    output: string;
    testType: string;
}

// プロジェクトのテスト設定を自動検出する
async function detectTestConfig(): Promise<{ command: string; type: string } | null> {
    const cwd = process.cwd();

    // package.json のテストスクリプトを確認
    const pkgPath = path.join(cwd, 'package.json');
    if (await fileExists(pkgPath)) {
        try {
            const { default: fs } = await import('fs/promises');
            const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
            if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
                return { command: 'npm test', type: 'npm test' };
            }
            if (pkg.scripts?.lint) {
                return { command: 'npm run lint', type: 'npm run lint' };
            }
        } catch { /* 無視 */ }
    }

    // pytest の存在確認
    if (await fileExists(path.join(cwd, 'pytest.ini')) ||
        await fileExists(path.join(cwd, 'setup.cfg')) ||
        await fileExists(path.join(cwd, 'pyproject.toml'))) {
        try {
            execSync('python -m pytest --version', { stdio: 'pipe' });
            return { command: 'python -m pytest --tb=short -q', type: 'pytest' };
        } catch { /* pytestが利用不可 */ }
    }

    return null;
}

// Python ファイルの構文チェック
async function checkPythonSyntax(filePath: string): Promise<TestResult> {
    try {
        execSync(`python -c "import py_compile; py_compile.compile('${filePath}', doraise=True)"`, { stdio: 'pipe' });
        return { passed: true, output: '構文エラーなし', testType: 'py_compile' };
    } catch (err) {
        return { passed: false, output: (err as Error).message, testType: 'py_compile' };
    }
}

// TypeScript ファイルの構文チェック
async function checkTypeScriptSyntax(): Promise<TestResult> {
    try {
        const output = execSync('npx tsc --noEmit 2>&1', { stdio: 'pipe', timeout: 30000 }).toString();
        return { passed: true, output: output || 'コンパイルエラーなし', testType: 'tsc' };
    } catch (err) {
        return { passed: false, output: (err as Error).message, testType: 'tsc' };
    }
}

// 自動テストを実行する（ファイル編集後に呼び出す）
export async function runAutoTests(editedFilePath?: string): Promise<TestResult[]> {
    if (!_autoTestEnabled) return [];

    const results: TestResult[] = [];

    console.log(chalk.dim('  🧪 自動テストを実行中...'));

    // 1. 編集されたファイルの構文チェック
    if (editedFilePath) {
        const ext = path.extname(editedFilePath).toLowerCase();
        if (ext === '.py') {
            const syntaxResult = await checkPythonSyntax(editedFilePath);
            results.push(syntaxResult);
            if (!syntaxResult.passed) {
                console.log(chalk.red(`  ✗ Python構文エラー: ${syntaxResult.output}`));
            } else {
                console.log(chalk.green(`  ✓ Python構文チェック OK`));
            }
        } else if (ext === '.ts' || ext === '.tsx') {
            const tsResult = await checkTypeScriptSyntax();
            results.push(tsResult);
            if (!tsResult.passed) {
                console.log(chalk.red(`  ✗ TypeScriptエラー: ${tsResult.output}`));
            } else {
                console.log(chalk.green(`  ✓ TypeScriptチェック OK`));
            }
        }
    }

    // 2. プロジェクトのテストを実行
    const testConfig = await detectTestConfig();
    if (testConfig) {
        try {
            console.log(chalk.dim(`  📋 ${testConfig.type} を実行中...`));
            const output = execSync(testConfig.command, { stdio: 'pipe', timeout: 60000 }).toString();
            results.push({ passed: true, output, testType: testConfig.type });
            console.log(chalk.green(`  ✓ ${testConfig.type} 完了`));
        } catch (err) {
            const output = (err as Error).message;
            results.push({ passed: false, output, testType: testConfig.type });
            console.log(chalk.red(`  ✗ ${testConfig.type} 失敗`));
        }
    }

    return results;
}

// テスト結果をLLMへのフィードバック文字列として整形する
export function formatTestResultsForLLM(results: TestResult[]): string {
    if (results.length === 0) return '';

    const failed = results.filter(r => !r.passed);
    if (failed.length === 0) return '';

    let feedback = '\n[自動テスト結果 — 以下のエラーを修正してください]\n';
    for (const result of failed) {
        feedback += `\n--- ${result.testType} ---\n${result.output}\n`;
    }
    return feedback;
}
