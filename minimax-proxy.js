#!/usr/bin/env node
/**
 * MiniMax M2.5 Free Proxy
 * Translates Claude Code's Anthropic API calls → Ollama (minimax-m2.5:cloud)
 * Runs on port 8082 (same as your old puter proxy)
 * Usage: node minimax-proxy.js
 */

const http = require('http');
const https = require('https');

const PORT = 8082;
const OLLAMA_HOST = 'localhost';
const OLLAMA_PORT = 11434;
const MINIMAX_MODEL = 'minimax-m2.5:cloud';

function ollamaRequest(body, res) {
    const payload = JSON.stringify(body);
    const options = {
        hostname: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: '/api/chat',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
        },
    };

    const isStream = body.stream !== false;

    const ollamaReq = http.request(options, (ollamaRes) => {
        if (isStream) {
            // Streaming: convert Ollama chunks → Anthropic SSE format
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
            });

            let inputTokens = 0;
            let outputTokens = 0;

            // Send message_start event
            const msgStart = {
                type: 'message_start',
                message: {
                    id: 'msg_' + Date.now(),
                    type: 'message',
                    role: 'assistant',
                    content: [],
                    model: 'claude-opus-4-6-20251101',
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: 0, output_tokens: 0 },
                },
            };
            res.write(`event: message_start\ndata: ${JSON.stringify(msgStart)}\n\n`);
            res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`);

            let buffer = '';
            ollamaRes.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.message && data.message.content) {
                            const deltaEvent = {
                                type: 'content_block_delta',
                                index: 0,
                                delta: { type: 'text_delta', text: data.message.content },
                            };
                            res.write(`event: content_block_delta\ndata: ${JSON.stringify(deltaEvent)}\n\n`);
                            outputTokens++;
                        }
                        if (data.done) {
                            inputTokens = data.prompt_eval_count || 0;
                            outputTokens = data.eval_count || outputTokens;
                        }
                    } catch (e) { }
                }
            });

            ollamaRes.on('end', () => {
                res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
                const msgDelta = {
                    type: 'message_delta',
                    delta: { stop_reason: 'end_turn', stop_sequence: null },
                    usage: { output_tokens: outputTokens },
                };
                res.write(`event: message_delta\ndata: ${JSON.stringify(msgDelta)}\n\n`);
                res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
                res.end();
            });
        } else {
            // Non-streaming: collect full response
            let rawData = '';
            ollamaRes.on('data', (chunk) => { rawData += chunk; });
            ollamaRes.on('end', () => {
                try {
                    const lines = rawData.trim().split('\n');
                    let fullText = '';
                    let inputTokens = 0, outputTokens = 0;
                    for (const line of lines) {
                        const d = JSON.parse(line);
                        if (d.message && d.message.content) fullText += d.message.content;
                        if (d.done) {
                            inputTokens = d.prompt_eval_count || 0;
                            outputTokens = d.eval_count || 0;
                        }
                    }
                    const anthropicResp = {
                        id: 'msg_' + Date.now(),
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'text', text: fullText }],
                        model: 'claude-opus-4-6-20251101',
                        stop_reason: 'end_turn',
                        stop_sequence: null,
                        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
                    };
                    const respJson = JSON.stringify(anthropicResp);
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(respJson);
                } catch (e) {
                    res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
                }
            });
        }
    });

    ollamaReq.on('error', (e) => {
        console.error('Ollama error:', e.message);
        res.writeHead(502);
        res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Ollama connection failed: ' + e.message } }));
    });

    ollamaReq.write(payload);
    ollamaReq.end();
}

const server = http.createServer((req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta',
        });
        return res.end();
    }

    const url = req.url;
    console.log(`[${new Date().toISOString()}] ${req.method} ${url}`);

    // Health check
    if (url === '/' || url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', model: MINIMAX_MODEL, provider: 'Ollama (free)' }));
    }

    // Handle /v1/messages (Anthropic) or /anthropic/v1/messages
    if ((url === '/v1/messages' || url.endsWith('/v1/messages')) && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const anthropicBody = JSON.parse(body);

                // Convert Anthropic messages format → Ollama format
                const messages = (anthropicBody.messages || []).map(m => ({
                    role: m.role,
                    content: Array.isArray(m.content)
                        ? m.content.map(c => c.text || '').join('')
                        : m.content,
                }));

                // Add system prompt if present
                if (anthropicBody.system) {
                    messages.unshift({
                        role: 'system', content:
                            Array.isArray(anthropicBody.system)
                                ? anthropicBody.system.map(c => c.text || '').join('')
                                : anthropicBody.system
                    });
                }

                const ollamaBody = {
                    model: MINIMAX_MODEL,
                    messages,
                    stream: anthropicBody.stream !== false,
                    options: {
                        num_predict: anthropicBody.max_tokens || 4096,
                        temperature: anthropicBody.temperature || 0.7,
                    },
                };

                ollamaRequest(ollamaBody, res);
            } catch (e) {
                console.error('Parse error:', e.message);
                res.writeHead(400);
                res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: e.message } }));
            }
        });
        return;
    }

    // Fallback 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found', path: url }));
});

server.listen(PORT, () => {
    console.log(`\n🚀 MiniMax M2.5 Free Proxy running on http://localhost:${PORT}`);
    console.log(`   Model: ${MINIMAX_MODEL} (via Ollama)`);
    console.log(`   Claude Code config:`);
    console.log(`   ANTHROPIC_BASE_URL=http://localhost:${PORT}`);
    console.log(`   ANTHROPIC_API_KEY=free\n`);
});
