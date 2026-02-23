// Web検索ツール — DuckDuckGo APIを使った無料Web検索
import type { ToolDefinition } from '../types';

export const webSearchTool: ToolDefinition = {
    definition: {
        type: 'function',
        function: {
            name: 'web_search',
            description: 'Webを検索してキーワードに関連する情報を取得する。',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: '検索クエリ',
                    },
                    maxResults: {
                        type: 'number',
                        description: '最大結果数（デフォルト: 5）',
                    },
                },
                required: ['query'],
            },
        },
    },

    async execute(args) {
        const query = args.query as string;
        const maxResults = (args.maxResults as number) || 5;

        try {
            // DuckDuckGo Instant Answer API（無料・API Key不要）
            const encodedQuery = encodeURIComponent(query);
            const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(url, {
                headers: { 'User-Agent': 'ShiningCode/1.0' },
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                return { success: false, output: '', error: `検索エラー: HTTP ${response.status}` };
            }

            const data = await response.json() as Record<string, unknown>;

            // 結果を整形
            const results: string[] = [];
            results.push(`検索クエリ: "${query}"\n`);

            // Abstract（概要）
            if (data.Abstract) {
                results.push(`## 概要`);
                results.push(`${data.Abstract}`);
                if (data.AbstractURL) {
                    results.push(`出典: ${data.AbstractURL}`);
                }
                results.push('');
            }

            // Answer (direct answer)
            if (data.Answer) {
                results.push(`## 回答`);
                results.push(`${data.Answer}`);
                results.push('');
            }

            // Related Topics
            if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                const topics = (data.RelatedTopics as Array<Record<string, unknown>>)
                    .filter(t => t.Text)
                    .slice(0, maxResults);

                if (topics.length > 0) {
                    results.push(`## 関連トピック`);
                    for (const topic of topics) {
                        results.push(`- ${topic.Text}`);
                        if (topic.FirstURL) {
                            results.push(`  URL: ${topic.FirstURL}`);
                        }
                    }
                }
            }

            // Results
            if (data.Results && Array.isArray(data.Results)) {
                const resultItems = (data.Results as Array<Record<string, unknown>>)
                    .slice(0, maxResults);

                if (resultItems.length > 0) {
                    results.push(`\n## 検索結果`);
                    for (const item of resultItems) {
                        results.push(`- ${item.Text}`);
                        if (item.FirstURL) {
                            results.push(`  URL: ${item.FirstURL}`);
                        }
                    }
                }
            }

            const output = results.join('\n');
            if (output.trim() === `検索クエリ: "${query}"`) {
                return {
                    success: true,
                    output: `検索クエリ: "${query}"\n\n直接的な結果が見つかりませんでした。web_fetchツールで特定のURLを直接取得してください。`,
                };
            }

            return { success: true, output };
        } catch (err) {
            return { success: false, output: '', error: `Web検索エラー: ${(err as Error).message}` };
        }
    },
};
