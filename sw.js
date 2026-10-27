const CACHE = 'pumppingo-v8';
const SHELL = ['./', 'index.html', 'icons/maskable-512.png', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'treino-state').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if(r.method !== 'GET') return;
  const u = new URL(r.url);
  if(u.origin === location.origin){
    // rede primeiro (pega atualizações), cache se offline
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); return res; }).catch(() => caches.match(r).then(m => m || caches.match('index.html'))));
  } else if(/fonts\.(googleapis|gstatic)\.com/.test(u.host)){
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); return res; })));
  }
});
function today(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
self.addEventListener('push', e => {
  let data = {}; try{ data = e.data ? e.data.json() : {}; }catch(_){}
  e.waitUntil((async () => {
    let trained = false;
    try{ const c = await caches.open('treino-state'); const m = await c.match('/last-session'); trained = m && (await m.text()) === today(); }catch(_){}
    let title, body;
    if(data.slot === 'noite' && trained){ title = 'Treino de hoje feito ✅'; body = 'Como ficou o joelho? Registra a dor de 0 a 10.'; }
    else if(data.slot === 'noite'){ title = 'Ainda dá tempo de treinar'; body = 'Seu treino de hoje está te esperando 💪'; }
    else { title = 'Bom dia, hora do treino'; body = 'Abre o app e começa pela primeira série 💪'; }
    const url = data.slot === 'noite' && trained ? './#joelho' : './#treino';
    await self.registration.showNotification(title, { body, icon:'icons/icon-192.png', badge:'icons/icon-192.png', tag:'lembrete', vibrate:[200,100,200], data:{ url } });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(ws => { for(const w of ws){ if('focus' in w){ w.navigate && w.navigate(url); return w.focus(); } } return clients.openWindow(url); }));
});
