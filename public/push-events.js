/* Imported by the generated production worker; no financial content is cached here. */
self.addEventListener("push", event => {
  let data;
  try { data = event.data?.json(); } catch { data = null; }
  // Only display the app's private generic message, never arbitrary provider payload contents.
  const test = data?.tag === "ledgerline-test";
  const count = /^\d{1,5} payment or renewal reminders? to review\.$/.test(data?.body ?? "") ? data.body : "Open Thapal to review your reminders.";
  event.waitUntil(self.registration.showNotification("Thapal", {
    body: test ? "Notifications are working on this device." : count,
    icon: "/app-icon.png", badge: "/app-icon.png", tag: test ? "ledgerline-test" : "ledgerline-reminders",
    data: { url: "/plan" },
  }).then(async () => {
    // Tell open app windows the test reached this device, so Settings can show "Delivered".
    if (!test) return;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    windows.forEach(client => client.postMessage({ type: "ledgerline-test-shown", at: Date.now() }));
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL("/plan", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(url); await existing.focus(); }
    else await self.clients.openWindow(url);
  })());
});