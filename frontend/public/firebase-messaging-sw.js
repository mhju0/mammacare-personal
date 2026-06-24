importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBvUHYbed-me1pT3r2QzWzPFR-UwhgLmhs",
  authDomain: "mammacare-ce9a5.firebaseapp.com",
  projectId: "mammacare-ce9a5",
  messagingSenderId: "183720164110",
  appId: "1:183720164110:web:d09aabbf01b086cc38b55f",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "맘마케어 알림";
  const options = {
    body: payload.notification?.body || "",
    data: payload.data || {},
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetRoute = event.notification.data?.target_route || "/";
  const targetUrl = new URL(targetRoute, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) {
            return client.navigate(targetUrl).then((navigatedClient) => {
              if (navigatedClient && "focus" in navigatedClient) return navigatedClient.focus();
              return client.focus();
            });
          }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
