/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

precacheAndRoute(self.__WB_MANIFEST);

interface PushPayload {
  title?: string;
  body?: string;
  urgency?: "normal" | "urgent" | "emergency";
  url?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  let payload: PushPayload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const urgency = payload.urgency ?? "normal";
  const title = payload.title ?? "MVX Investor Portal";

  const vibrate =
    urgency === "emergency" ? [200, 100, 200, 100, 200] : urgency === "urgent" ? [150, 75, 150] : [100];

  const options: NotificationOptions & { vibrate?: number[] } = {
    body: payload.body ?? "",
    icon: "/mvx-logo.png",
    badge: "/mvx-logo.png",
    tag: "mvx-poll-" + Date.now(),
    requireInteraction: urgency === "emergency",
    vibrate,
    data: { url: payload.url ?? "/abstimmungen" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => "url" in c && (c as WindowClient).url.includes(url));
      if (existing) return (existing as WindowClient).focus();
      return self.clients.openWindow(url);
    })
  );
});
