const CACHE = 'treinoth-v9';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/favicon-32.png', 'icons/badge-96.png'];
const ICON = 'icons/icon-192.png', BADGE = 'icons/badge-96.png';

// cada arquivo entra no cache sozinho: um 404 não derruba mais a instalação do service worker
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'treino-state').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request; if(r.method !== 'GET') return;
  const u = new URL(r.url);
  if(u.origin === location.origin){
    // rede primeiro (pega atualizações), cache se offline
    e.respondWith(fetch(r).then(res => { if(res.ok){ const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); } return res; })
      .catch(() => caches.match(r, { ignoreSearch:true }).then(m => m || caches.match('index.html'))));
  } else if(/fonts\.(googleapis|gstatic)\.com/.test(u.host)){
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); return res; })));
  }
});

/* ---------- fim do descanso ----------
   A página manda {type:'rest', end} quando começa um descanso. O service worker segura o evento aberto
   (waitUntil) até o horário e mostra a notificação. Assim o aviso sai mesmo com a tela bloqueada ou o app
   em segundo plano (o Chrome no Android mantém o evento vivo por alguns minutos). Se o app estiver visível
   na hora, quem avisa é a própria página (som + timer vermelho) e a notificação não aparece. */
let restGen = 0;
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
self.addEventListener('message', e => {
  const d = e.data || {};
  if(d.type === 'rest-cancel'){ restGen++; e.waitUntil(closeRest()); return; }
  if(d.type !== 'rest' || !d.end) return;
  const gen = ++restGen;
  e.waitUntil((async () => {
    await closeRest();
    await sleep(d.end - Date.now());
    if(gen !== restGen) return;
    const ws = await clients.matchAll({ type:'window', includeUncontrolled:true });
    if(!d.force && ws.some(w => w.visibilityState === 'visible')) return;
    await self.registration.showNotification('Descanso acabou ⏱️', {
      body: d.next ? 'Próxima: ' + d.next : 'Bora pra próxima série 💪',
      icon: ICON, badge: BADGE, tag: 'descanso', renotify: true,
      vibrate: [500, 150, 500, 150, 800], silent: false, data: { url: './#treino' }
    });
  })());
});
async function closeRest(){ try{ (await self.registration.getNotifications({ tag:'descanso' })).forEach(n => n.close()); }catch(_){} }

/* ---------- lembretes de treino (push vindo do servidor) ---------- */
function today(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
self.addEventListener('push', e => {
  let data = {}; try{ data = e.data ? e.data.json() : {}; }catch(_){}
  e.waitUntil((async () => {
    let trained = false;
    try{ const c = await caches.open('treino-state'); const m = await c.match('/last-session'); trained = m && (await m.text()) === today(); }catch(_){}
    let title, body;
    if(data.title){ title = data.title; body = data.body || ''; }
    else if(data.slot === 'noite' && trained){ title = 'Treino de hoje feito ✅'; body = 'Como ficou o joelho? Registra a dor de 0 a 10.'; }
    else if(data.slot === 'noite'){ title = 'Ainda dá tempo de treinar'; body = 'Seu treino de hoje está te esperando 💪'; }
    else { title = 'Bom dia, hora do treino'; body = 'Abre o Treino TH e começa pela primeira série 💪'; }
    const url = data.url || (data.slot === 'noite' && trained ? './#joelho' : './#treino');
    await self.registration.showNotification(title, { body, icon:ICON, badge:BADGE, tag:'lembrete', vibrate:[200,100,200], data:{ url } });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(ws => { for(const w of ws){ if('focus' in w){ w.navigate && w.navigate(url); return w.focus(); } } return clients.openWindow(url); }));
});
