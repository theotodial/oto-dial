/* Service worker for Web Push - shows notification when app is closed or in background */
self.addEventListener("push", function (event) {
  if (!event.data) return;
  let payload = { title: "New message", body: "" };
  try {
    payload = event.data.json();
  } catch (_) {
    payload.body = event.data.text();
  }
  const title = payload.title || "New message";
  const options = {
    body: payload.body || "You have a new message",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: "oto-dial-message",
    data: payload.data || { url: "/recents" },
    requireInteraction: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data?.url || "/recents";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
