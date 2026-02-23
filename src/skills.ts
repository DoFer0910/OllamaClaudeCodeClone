// スキルシステム — .mdファイルからシステムプロンプトへのカスタム指示注入
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

// スキルファイルの最大サイズ（50KB）
const MAX_SKILL_SIZE = 50 * 1024;

// スキル情報の型
interface SkillInfo {
    name: string;
    path: string;
    size: number;
    source: 'global' | 'project';
}

// グローバルスキルディレクトリを取得する
function getGlobalSkillsDir(): string {
    return path.join(os.homedir(), '.config', 'shiningcode', 'skills');
}

// プロジェクトレベルのスキルディレクトリ候補を取得する
function getProjectSkillsDirs(): string[] {
    const cwd = process.cwd();
    return [
        path.join(cwd, '.shiningcode', 'skills'),
        path.join(cwd, 'skills'),
    ];
}

// ディレクトリから.mdファイルを読み込む
async function loadSkillsFromDir(dir: string, source: 'global' | 'project'): Promise<{ info: SkillInfo; content: string }[]> {
    const results: { info: SkillInfo; content: string }[] = [];

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isFile()) continue; // シンボリックリンクは無視（セキュリティ）
            if (!entry.name.endsWith('.md')) continue;

            const filePath = path.join(dir, entry.name);
            try {
                const stat = await fs.lstat(filePath);

                // シンボリックリンクは無視（セキュリティ）
                if (stat.isSymbolicLink()) continue;

                // サイズチェック
                if (stat.size > MAX_SKILL_SIZE) {
                    console.log(chalk.yellow(`  ⚠ スキルファイルが大きすぎます（50KB超）: ${entry.name}`));
                    continue;
                }

                const content = await fs.readFile(filePath, 'utf-8');
                results.push({
                    info: {
                        name: entry.name.replace('.md', ''),
                        path: filePath,
                        size: stat.size,
                        source,
                    },
                    content,
                });
            } catch { /* ファイル読み込みエラーは無視 */ }
        }
    } catch { /* ディレクトリが存在しない場合は無視 */ }

    return results;
}

// 全スキルを読み込み、システムプロンプト用文字列を生成する
export async function loadAllSkills(): Promise<{ skills: SkillInfo[]; promptText: string }> {
    const allSkills: { info: SkillInfo; content: string }[] = [];

    // グローバルスキルを読み込み
    const globalDir = getGlobalSkillsDir();
    const globalSkills = await loadSkillsFromDir(globalDir, 'global');
    allSkills.push(...globalSkills);

    // プロジェクトスキルを読み込み
    for (const dir of getProjectSkillsDirs()) {
        const projectSkills = await loadSkillsFromDir(dir, 'project');
        allSkills.push(...projectSkills);
    }

    if (allSkills.length === 0) {
        return { skills: [], promptText: '' };
    }

    // システムプロンプト用テキストを生成
    let promptText = '\n## カスタムスキル\n';
    for (const { info, content } of allSkills) {
        promptText += `\n### スキル: ${info.name} (${info.source})\n`;
        promptText += content + '\n';
    }

    return {
        skills: allSkills.map(s => s.info),
        promptText,
    };
}

// スキル一覧を表示する
export async function printSkillsList(): Promise<void> {
    const { skills } = await loadAllSkills();

    if (skills.length === 0) {
        console.log(chalk.dim('  スキルが見つかりません。'));
        console.log(chalk.dim(`  グローバル: ${getGlobalSkillsDir()}`));
        console.log(chalk.dim(`  プロジェクト: .shiningcode/skills/ または skills/`));
        return;
    }

    console.log(chalk.cyan('  読み込まれたスキル:'));
    for (const skill of skills) {
        const sizeKB = (skill.size / 1024).toFixed(1);
        const sourceLabel = skill.source === 'global' ? chalk.blue('[G]') : chalk.green('[P]');
        console.log(chalk.dim(`    ${sourceLabel} ${skill.name} (${sizeKB}KB)`));
    }
}
