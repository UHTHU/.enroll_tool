// Course Calendar — Cloudflare Worker
//
// Serves the static app from /public (the course calendar SPA) via the
// Cloudflare Workers Assets binding. The calendar app stores all data in
// browser localStorage, so no server-side persistence is required.
//
// Future expansion: add routes below (e.g. /api/*) for KV/D1-backed sync.

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: import('@cloudflare/workers-types').Fetcher }} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- Optional API endpoints (uncomment to enable, e.g. KV sync) ---
    // if (path.startsWith('/api/')) {
    //   return handleApi(request, env, path);
    // }

    // Simple health check
    if (path === '/health') {
      return new Response('ok', {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    // Serve static assets from ./public (calendar.html, icons, etc.).
    // Requests to "/" automatically resolve to index.html if present or we
    // redirect to /calendar.html when no index exists.
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404 || path === '/') {
      // The HTML shell must always be revalidated so browsers/CDNs pick up
      // the newest deploy instead of serving a stale cached copy.
      if (assetResponse.status === 200 && (path === '/' || path.endsWith('.html'))) {
        const headers = new Headers(assetResponse.headers);
        headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        headers.set('Pragma', 'no-cache');
        headers.set('Expires', '0');
        return new Response(assetResponse.body, {
          status: assetResponse.status,
          statusText: assetResponse.statusText,
          headers: headers,
        });
      }
      return assetResponse;
    }

    // Return a helpful 404 for any unknown asset path.
    return new Response('Not found. The course calendar lives at /calendar.html', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};