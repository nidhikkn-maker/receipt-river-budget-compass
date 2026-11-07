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
