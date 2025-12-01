/**
 * Cloudflare Worker for serving static assets and handling SPA routing
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Try to serve static assets first
    try {
      // Handle root path and SPA routing
      if (pathname === '/' || pathname === '/index.html') {
        const asset = await env.ASSETS.fetch(new Request(request.url, {
          method: 'GET'
        }));
        if (asset.ok) {
          return asset;
        }
      }

      // Handle other static assets (JS, CSS, images, etc.)
      const asset = await env.ASSETS.fetch(new Request(request.url, {
        method: 'GET'
      }));

      if (asset.ok) {
        return asset;
      }

      // If no static asset found, serve index.html for SPA routing
      const indexAsset = await env.ASSETS.fetch(new Request(`${url.origin}/index.html`, {
        method: 'GET'
      }));

      if (indexAsset.ok) {
        return indexAsset;
      }

    } catch (error) {
      console.error('Error serving asset:', error);
    }

    // Fallback response
    return new Response('Not Found', { status: 404 });
  },
};