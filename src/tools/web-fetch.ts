// Web取得ツール — URLからテキスト内容を取得する
import type { ToolDefinition } from '../types';

// HTMLからテキストを抽出する簡易パーサー
function htmlToText(html: string): string {
    return html
        // スクリプトとスタイルタグを除去
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        // HTMLタグを除去
        .replace(/<[^>]+>/g, ' ')
        // HTMLエンティティをデコード
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // 連続する空白を圧縮
        .replace(/\s+/g, ' ')
        .trim();
}

export const webFetchTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'web_fetch',
            description: 'URLからWebページやAPIの内容をテキストとして取得する。',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: '取得するURL',
                    },
                    raw: {
                        type: 'boolean',
                        description: 'trueの場合、HTMLをそのまま返す（デフォルト: false でテキスト抽出）',
                    },
                },
                required: ['url'],
            },
        },
    },

    async execute(args) {
        const url = args.url as string;
        const raw = args.raw as boolean || false;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'ShiningCode/1.0 (AI Coding Agent)',
                    'Accept': 'text/html,application/json,text/plain,*/*',
                },
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                return {
                    success: false,
                    output: '',
                    error: `HTTP ${response.status}: ${response.statusText}`,
                };
            }

            const contentType = response.headers.get('content-type') || '';
            const text = await response.text();

            // JSON レスポンスの場合
            if (contentType.includes('application/json')) {
                try {
                    const json = JSON.parse(text);
                    return {
                        success: true,
                        output: JSON.stringify(json, null, 2).substring(0, 50000),
                    };
                } catch {
                    return { success: true, output: text.substring(0, 50000) };
                }
            }

            // HTMLの場合はテキスト抽出
            if (contentType.includes('text/html') && !raw) {
                const extracted = htmlToText(text);
                return {
                    success: true,
                    output: `URL: ${url}\n\n${extracted.substring(0, 50000)}`,
                };
            }

            return {
                success: true,
                output: text.substring(0, 50000),
            };
        } catch (err) {
            return { success: false, output: '', error: `Web取得エラー: ${(err as Error).message}` };
        }
    },
};
