// public/sw.js  (스코프가 "/"가 되도록 꼭 /sw.js 로 배치)
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

// 백그라운드 수신(데이터 메시지 전용으로 사용)
messaging.onBackgroundMessage(async (payload) => {
  const d = payload?.data || {};
  const title = d.title || '새 알림';
  const body  = d.body  || '';
  const url   = d.url   || '/woori-dashboard.html';
  const tag   = d.tag   || 'freetalk';

  // 같은 tag의 기존 알림은 닫고 하나만 유지 (중복 방지)
  const existing = await self.registration.getNotifications({ tag, includeTriggered: true });
  existing.forEach(n => n.close());

  await self.registration.showNotification(title, {
    body,
    icon:  d.icon  || '/img/icon1101.png',
    badge: d.badge || '/img/icon1101.png',
    tag,
    renotify: false,                // 덮어쓸 때 소리 반복 방지
    data: { url, tag, ts: Date.now() },
    actions: [
      { action: 'open',  title: '열기' },
      { action: 'close', title: '닫기' }
    ]
  });
});

// 알림 클릭 → 기존 창 포커스 or 새 창 열기
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const url = event.notification?.data?.url || '/woori-dashboard.html';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const target = new URL(url, self.location.origin).href;
    for (const c of all) {
      // 같은 경로면 포커스
      if (new URL(c.url).pathname === new URL(target).pathname) {
        return c.focus();
      }
    }
    return clients.openWindow(target);
  })());
});
