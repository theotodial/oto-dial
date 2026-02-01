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
  const isCall = payload.data?.type === "call";
  const options = {
    body: payload.body || "You have a new message",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: isCall ? `oto-dial-call-${payload.data?.from || 'unknown'}` : "oto-dial-message",
    data: payload.data || { url: "/recents" },
    // Calls require interaction (user must click), messages don't
    requireInteraction: isCall,
    // Calls should have sound/vibration
    vibrate: isCall ? [200, 100, 200] : undefined
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
