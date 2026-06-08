/* 秘書室 service worker
 * シェルは network-first（更新を取りこぼさない）。オフライン時のみキャッシュへフォールバック。
 * Supabase API（/rest/, /auth/）と外部CDNは常にネットワーク（キャッシュしない）。
 */
const CACHE = "hisho-shell-v2";
const SHELL = [
  "./index.html",
  "./app.css",
  "./tokens.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-maskable.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // API・認証・外部CDNはネットワークに任せる（キャッシュ汚染回避）
  if (url.origin !== location.origin || url.pathname.includes("/rest/") || url.pathname.includes("/auth/")) return;

  // シェルは network-first。成功時にキャッシュ更新、失敗時（オフライン）はキャッシュ→index.html
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match("./index.html")))
  );
});
