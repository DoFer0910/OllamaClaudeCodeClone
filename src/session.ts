// セッション永続化 — JSONL形式での会話の保存・読み込み・再開
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { Message, SessionData } from './types';

// セッション保存ディレクトリ
function getSessionDir(): string {
    if (process.platform === 'win32') {
        return path.join(os.homedir(), '.config', 'shiningcode', 'sessions');
    }
    return path.join(os.homedir(), '.config', 'shiningcode', 'sessions');
}

// ランダムなセッションIDを生成する
export function generateSessionId(): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
}

// セッションを保存する（JSONL形式）
export async function saveSession(session: SessionData): Promise<void> {
    const dir = getSessionDir();
    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, `${session.id}.jsonl`);

    // メタデータ行 + メッセージ行のJSONL形式
    const lines: string[] = [];
    lines.push(JSON.stringify({
        type: 'meta',
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        model: session.model,
        cwd: session.cwd,
    }));

    for (const msg of session.messages) {
        lines.push(JSON.stringify({
            type: 'message',
            role: msg.role,
            content: msg.content,
            ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
        }));
    }

    await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');
}

// セッションを読み込む
export async function loadSession(sessionId: string): Promise<SessionData | null> {
    const dir = getSessionDir();
    const filePath = path.join(dir, `${sessionId}.jsonl`);

    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n');

        if (lines.length === 0) return null;

        // メタデータ行を解析
        const meta = JSON.parse(lines[0]);
        if (meta.type !== 'meta') return null;

        // メッセージ行を解析
        const messages: Message[] = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === 'message') {
                    const msg: Message = {
                        role: parsed.role,
                        content: parsed.content,
                    };
                    if (parsed.tool_calls) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (msg as any).tool_calls = parsed.tool_calls;
                    }
                    messages.push(msg);
                }
            } catch {
                // 壊れた行は無視
            }
        }

        return {
            id: meta.id,
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt,
            model: meta.model,
            cwd: meta.cwd,
            messages,
        };
    } catch {
        return null;
    }
}

// セッション一覧を取得する（最新順）
export async function listSessions(limit: number = 10): Promise<{ id: string; createdAt: string; model: string; messageCount: number }[]> {
    const dir = getSessionDir();

    try {
        const files = await fs.readdir(dir);
        const sessions: { id: string; createdAt: string; model: string; messageCount: number; updatedAt: string }[] = [];

        for (const file of files) {
            if (!file.endsWith('.jsonl')) continue;
            try {
                const content = await fs.readFile(path.join(dir, file), 'utf-8');
                const firstLine = content.split('\n')[0];
                const meta = JSON.parse(firstLine);
                if (meta.type !== 'meta') continue;

                const lineCount = content.trim().split('\n').length - 1; // メタ行を除く
                sessions.push({
                    id: meta.id,
                    createdAt: meta.createdAt,
                    updatedAt: meta.updatedAt || meta.createdAt,
                    model: meta.model,
                    messageCount: lineCount,
                });
            } catch {
                // 壊れたファイルは無視
            }
        }

        // 最新順にソート
        sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return sessions.slice(0, limit);
    } catch {
        return [];
    }
}

// 最新セッションのIDを取得する
export async function getLatestSessionId(): Promise<string | null> {
    const sessions = await listSessions(1);
    return sessions.length > 0 ? sessions[0].id : null;
}

// メッセージを既存セッションに追記する（差分追記）
export async function appendMessage(sessionId: string, message: Message): Promise<void> {
    const dir = getSessionDir();
    const filePath = path.join(dir, `${sessionId}.jsonl`);

    const line = JSON.stringify({
        type: 'message',
        role: message.role,
        content: message.content,
        ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
    });

    await fs.appendFile(filePath, line + '\n', 'utf-8');
}
