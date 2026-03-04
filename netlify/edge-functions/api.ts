/**
 * Netlify Edge Function – catch-all handler for /api/* routes.
 *
 * The api/*.js files were written for Vercel's Edge Runtime, which uses
 * the same Web API (Request / Response) as Netlify Edge Functions.
 * This file dynamically imports the correct handler from api/ and invokes it.
 */

export default async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Strip /api/ prefix and get the first path segment (the handler file name)
    // e.g. /api/risk-scores → risk-scores
    //      /api/eia/petroleum → eia/petroleum (for sub-directories)
    const apiPath = url.pathname.replace(/^\/api\//, '');
    const segments = apiPath.split('/').filter(Boolean);

    if (segments.length === 0) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }

    // Try to find a matching handler
    // Try exact path first (e.g. eia/petroleum.js), then top-level (e.g. eia.js)
    const candidates = [
        `/api/${segments.join('/')}.js`,
        `/api/${segments[0]}.js`,
    ];

    for (const candidate of candidates) {
        try {
            const mod = await import(candidate);
            const fn = mod.default ?? mod.handler;
            if (typeof fn === 'function') {
                const response = await fn(request);
                // Add CORS header to all API responses
                const headers = new Headers(response.headers);
                headers.set('Access-Control-Allow-Origin', '*');
                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                });
            }
        } catch {
            // Handler not found at this path, try next candidate
            continue;
        }
    }

    return new Response(JSON.stringify({ error: `No handler found for ${url.pathname}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
}

export const config = { path: '/api/*' };
