/* /sw.js ─────────────────────────────────────────────
 * Firebase Cloud Messaging (data-only)
 *  - 아이콘: /img/icon1101.png
 *  - 안드로이드/PWA에서도 중복 없이 1회만 표시
 * --------------------------------------------------- */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",
  authDomain: "woori-1ecf5.firebaseapp.com",
  projectId: "woori-1ecf5",
  messagingSenderId: "1073097361525",
  appId: "1:1073097361525:web:3218ced6a040aaaf4d503c"
});

const messaging = firebase.messaging();

/* 즉시 활성화 */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

let lastNotifKey = null;

/* ── 백그라운드 수신(데이터 메시지 전용) ── */
messaging.onBackgroundMessage(async (payload) => {
  try {
    const d = payload?.data || {};

    // dedupe key (id 우선, 없으면 ts)
    const key = d.id || d.ts || '';
    if (key && key === lastNotifKey) return;
    lastNotifKey = key;

    const title = d.title || '새 알림';
    const body  = d.body  || '';
    const url   = d.url   || '/';
    const tag   = d.tag   || 'freetalk';

    const icon  = d.icon  || '/img/icon1101.png';
    const badge = d.badge || '/img/icon1101.png';

    await self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      renotify: false,
      requireInteraction: false,
      data: { url, ts: Date.now() }
    });

    /* ✅ 추가 부분 — 페이지로 메시지 전달 (예: 채팅 뱃지 표시용) */
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clientsArr) => {
      for (const client of clientsArr) {
        client.postMessage({
          kind: 'push',
          tag,
          title,
          body,
          url
        });
      }
    });

  } catch (err) {
    console.warn('[sw] onBackgroundMessage error:', err);
  }
});


/* ── 클릭 시 기존 탭 포커스 또는 새 창 열기 ── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';

  event.waitUntil((async () => {
    try {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const sameOrigin = all.find(c => new URL(c.url).origin === location.origin);
      if (sameOrigin) {
        try { await sameOrigin.focus(); } catch {}
        try { await sameOrigin.navigate(url); } catch {}
        return;
      }
      await clients.openWindow(url);
    } catch {
      await clients.openWindow(url);
    }
  })());
});
