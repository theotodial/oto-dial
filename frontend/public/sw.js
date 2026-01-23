self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (err) {
    payload = { title: "Incoming call", body: event.data.text() };
  }

  const title = payload.title || "Incoming call";
  const options = {
    body: payload.body || "You have an incoming call",
    data: payload.data || {
      url: payload.url || "/recents",
      callId: payload.callId,
      callControlId: payload.callControlId
    },
    tag: payload.tag || "incoming-call",
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/recents";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if (client.url !== targetUrl && "navigate" in client) {
              client.navigate(targetUrl);
            }
            return;
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
