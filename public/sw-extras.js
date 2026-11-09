/* Instant opening: keep a ready copy of the start page in the saved-pages cache.
   - On install, save /dashboard if it isn't saved yet, so the very next tap on the app icon opens from the phone.
   - On activate (after every new release), refresh the saved pages so they point at the new app files
     instead of files that were just removed — otherwise the first open after a release is slow or blank.
   Pages here are only the app shell; records always come fresh from Cloud. */
(function () {
  var PAGES = "ledgerline-pages";
  var START = ["/dashboard"];
  function save(cache, url) {
    return fetch(url, { credentials: "same-origin", cache: "no-store" })
      .then(function (res) { if (res.ok && res.status === 200 && !res.redirected) return cache.put(url, res); })
      .catch(function () {});
  }
  self.addEventListener("install", function (event) {
    event.waitUntil(caches.open(PAGES).then(function (cache) {
      return Promise.all(START.map(function (url) {
        return cache.match(url).then(function (hit) { return hit ? null : save(cache, url); });
      }));
    }).catch(function () {}));
  });
  self.addEventListener("activate", function (event) {
    event.waitUntil(caches.open(PAGES).then(function (cache) {
      return cache.keys().then(function (keys) {
        var urls = keys.map(function (r) { return r.url; });
        START.forEach(function (u) { var full = new URL(u, self.location.origin).href; if (urls.indexOf(full) < 0) urls.push(full); });
        return Promise.all(urls.map(function (u) { return save(cache, u); }));
      });
    }).catch(function () {}));
  });
})();

/* Share to Thapal: files shared from WhatsApp, Photos or Files are kept on this phone only
   (never uploaded here) and the shared page asks what to do with them. */
(function () {
  var SHARED = "ledgerline-shared";
  self.addEventListener("fetch", function (event) {
    var url = new URL(event.request.url);
    if (event.request.method !== "POST" || url.origin !== self.location.origin || url.pathname !== "/share-target") return;
    event.respondWith((async function () {
      var batch = String(Date.now());
      try {
        var form = await event.request.formData();
        var files = form.getAll("files").filter(function (f) { return f && typeof f === "object" && f.size > 0; }).slice(0, 10);
        var cache = await caches.open(SHARED);
        await Promise.all(files.map(function (f, i) {
          return cache.put("/__shared/" + batch + "/" + i, new Response(f, { headers: { "content-type": f.type || "application/octet-stream", "x-file-name": encodeURIComponent(f.name || ("shared-" + i)) } }));
        }));
      } catch (e) { return Response.redirect("/shared?error=1", 303); }
      return Response.redirect("/shared?batch=" + batch, 303);
    })());
  });
})();
