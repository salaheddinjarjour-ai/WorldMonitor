#!/usr/bin/env node
/**
 * MiniMax M2.5 Free Proxy
 * Translates Claude Code's Anthropic API calls → Ollama (minimax-m2.5:cloud)
 * Runs on port 8082
 * Usage: node minimax-proxy.cjs
 */

const http = require('http');

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
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };

    const isStream = body.stream !== false;

    const ollamaReq = http.request(options, (ollamaRes) => {
        if (isStream) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
            });

            const msgStart = {
                type: 'message_start',
                message: { id: 'msg_' + Date.now(), type: 'message', role: 'assistant', content: [], model: 'claude-opus-4-6-20251101', stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
            };
            res.write(`event: message_start\ndata: ${JSON.stringify(msgStart)}\n\n`);
            res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`);

            let buffer = '';
            let outputTokens = 0;
            ollamaRes.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.message && data.message.content) {
                            res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: data.message.content } })}\n\n`);
                            outputTokens++;
                        }
                        if (data.done) outputTokens = data.eval_count || outputTokens;
                    } catch (e) { }
                }
            });

            ollamaRes.on('end', () => {
                res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
                res.write(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: outputTokens } })}\n\n`);
                res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
                res.end();
            });
        } else {
            let rawData = '';
            ollamaRes.on('data', (chunk) => { rawData += chunk; });
            ollamaRes.on('end', () => {
                try {
                    // Ollama with stream:false returns a single JSON object
                    const d = JSON.parse(rawData.trim());
                    const fullText = (d.message && d.message.content) ? d.message.content : '';
                    const inputTokens = d.prompt_eval_count || 0;
                    const outputTokens = d.eval_count || 0;
                    const resp = { id: 'msg_' + Date.now(), type: 'message', role: 'assistant', content: [{ type: 'text', text: fullText }], model: 'claude-opus-4-6-20251101', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: outputTokens } };
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify(resp));
                } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message, raw: rawData.substring(0, 200) })); }
            });
        }
    });

    ollamaReq.on('error', (e) => { res.writeHead(502); res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Ollama error: ' + e.message } })); });
    ollamaReq.write(payload);
    ollamaReq.end();
}

const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta' });
        return res.end();
    }

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

    if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', model: MINIMAX_MODEL, provider: 'Ollama (free)' }));
    }

    if ((req.url === '/v1/messages' || req.url.endsWith('/v1/messages')) && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const ab = JSON.parse(body);
                const messages = (ab.messages || []).map(m => ({ role: m.role, content: Array.isArray(m.content) ? m.content.map(c => c.text || '').join('') : m.content }));
                if (ab.system) messages.unshift({ role: 'system', content: Array.isArray(ab.system) ? ab.system.map(c => c.text || '').join('') : ab.system });
                ollamaRequest({ model: MINIMAX_MODEL, messages, stream: ab.stream !== false, options: { num_predict: ab.max_tokens || 8096, temperature: ab.temperature || 0.7 } }, res);
            } catch (e) { res.writeHead(400); res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: e.message } })); }
        });
        return;
    }

    res.writeHead(404); res.end(JSON.stringify({ error: 'Not found', path: req.url }));
});

server.listen(PORT, () => {
    console.log(`\n🚀 MiniMax M2.5 Free Proxy → http://localhost:${PORT}`);
    console.log(`   Model: ${MINIMAX_MODEL} via Ollama (FREE)`);
    console.log(`   Set: ANTHROPIC_BASE_URL=http://localhost:${PORT}`);
    console.log(`   Set: ANTHROPIC_API_KEY=free\n`);
});
