// Cloudflare Worker: relays Cesium ion requests for networks that cannot reach Cesium directly.
//   /api/...     -> https://api.cesium.com/...         (asset endpoints; asset URLs in the answer are rewritten to /assets/)
//   /assets/...  -> https://assets.ion.cesium.com/...  (terrain and 3D-building tiles)
// Only these two upstreams are allowed, so this is not an open proxy. The browser's token, Origin and Referer are passed
// through unchanged, so the token's "Allowed URLs" restriction still applies.
const UP = { api: "https://api.cesium.com", assets: "https://assets.ion.cesium.com" };
const ALLOWED_ORIGINS = [/^https:\/\/sara-alsalmi\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

const cors = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Accept, Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const okOrigin = !origin || ALLOWED_ORIGINS.some((r) => r.test(origin));
    if (!okOrigin) return new Response("origin not allowed", { status: 403 });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });

    const [, first, ...rest] = url.pathname.split("/");
    const base = UP[first];
    if (!base) return new Response("RoadGuard Cesium relay", { status: 200, headers: cors(origin) });
    const target = `${base}/${rest.join("/")}${url.search}`;

    const headers = new Headers();
    for (const h of ["Authorization", "Accept", "Origin", "Referer", "If-None-Match"]) {
      const v = req.headers.get(h);
      if (v) headers.set(h, v);
    }
    const upstream = await fetch(target, { method: req.method, headers, cf: { cacheEverything: first === "assets", cacheTtl: 86400 } });

    const out = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors(origin))) out.set(k, v);
    out.delete("Content-Security-Policy");

    // endpoint answers point to assets.ion.cesium.com: send those through this relay too
    if (first === "api" && (upstream.headers.get("Content-Type") || "").includes("json")) {
      const self = `${url.origin}/assets`;
      const text = (await upstream.text()).split(UP.assets).join(self);
      out.delete("Content-Length");
      out.delete("Content-Encoding");
      return new Response(text, { status: upstream.status, headers: out });
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
