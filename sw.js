const CACHE = 'treinoth-v18';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/favicon-32.png', 'icons/badge-96.png'];
const ICON = 'icons/icon-192.png', BADGE = 'icons/badge-96.png';

// cada arquivo entra no cache sozinho: um 404 não derruba mais a instalação do service worker
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k.startsWith('treinoth-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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

/* ---------- descanso: contagem na tela de bloqueio + alarme ----------
   A página manda {type:'rest', end, total, next} quando começa um descanso. O service worker segura o evento
   aberto (waitUntil) e, enquanto o app não está visível, mostra uma notificação silenciosa com a contagem
   ("Descanso 0:45"), atualizada a cada 5 s e a cada 1 s nos últimos 10 s. No fim vira o alarme (som + vibração).
   Botões na notificação: +15 s e Pular. Com o app aberto, quem avisa é a própria página e a notificação some.
   O Chrome no Android mantém o evento vivo por alguns minutos, o bastante para qualquer descanso. */
let restGen = 0, rest = null;
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
const fmt = s => Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
async function anyVisible(){ const ws = await clients.matchAll({ type:'window', includeUncontrolled:true }); return ws.some(w => w.visibilityState === 'visible'); }
async function tellPage(msg){ (await clients.matchAll({ type:'window', includeUncontrolled:true })).forEach(w => w.postMessage(msg)); }
function bar(left, total){ const n = 10, on = Math.max(0, Math.min(n, Math.round((1 - left/Math.max(1,total)) * n))); return '▰'.repeat(on) + '▱'.repeat(n - on); }
async function showCountdown(left){
  if(!rest) return;
  await self.registration.showNotification(left <= 10 ? `Prepare-se · ${fmt(left)}` : `Descanso · ${fmt(left)}`, {
    body: bar(left, rest.total) + (rest.next ? '\nPróxima: ' + rest.next : ''),
    icon: ICON, badge: BADGE, tag: 'descanso', renotify: false, silent: true, requireInteraction: true,
    actions: [{ action:'add15', title:'+15 s' }, { action:'skip', title:'Pular' }],
    data: { url:'./#treino' }
  });
}
async function runRest(gen){
  let shown = false;
  while(gen === restGen && rest){
    const left = Math.ceil((rest.end - Date.now()) / 1000);
    if(left <= 0) break;
    if(!rest.force && await anyVisible()){ if(shown){ await closeRest(); shown = false; } }
    else { await showCountdown(left); shown = true; }
    // acorda no próximo múltiplo de 5 s (ou a cada 1 s nos últimos 10 s)
    const msLeft = rest.end - Date.now();
    const step = left > 10 ? (msLeft - Math.max(10, Math.floor((left - 1) / 5) * 5) * 1000) : (msLeft - (left - 1) * 1000);
    await sleep(Math.max(200, Math.min(5000, step)));
  }
  if(gen !== restGen || !rest) return;
  const r = rest; rest = null;
  if(!r.force && await anyVisible()){ await closeRest(); return; }
  await self.registration.showNotification('Descanso acabou ⏱️', {
    body: r.next ? 'Próxima: ' + r.next : 'Bora pra próxima série 💪',
    icon: ICON, badge: BADGE, tag: 'descanso', renotify: true, silent: false, requireInteraction: false,
    vibrate: [500, 150, 500, 150, 800], data: { url:'./#treino' }
  });
}
self.addEventListener('message', e => {
  const d = e.data || {};
  if(d.type === 'rest-cancel'){ restGen++; rest = null; e.waitUntil(closeRest()); return; }
  if(d.type !== 'rest' || !d.end) return;
  const gen = ++restGen;
  rest = { end:d.end, total: d.total || Math.ceil((d.end - Date.now())/1000), next: d.next || '', force: !!d.force };
  e.waitUntil(runRest(gen));
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
  // botões da contagem do descanso
  if(e.action === 'add15' && rest){
    rest.end += 15000; rest.total += 15;
    e.waitUntil(Promise.all([showCountdown(Math.ceil((rest.end - Date.now())/1000)), tellPage({ type:'rest-sync', end:rest.end, total:rest.total })]));
    return;
  }
  if(e.action === 'skip'){
    restGen++; rest = null; e.notification.close();
    e.waitUntil(Promise.all([closeRest(), tellPage({ type:'rest-skip' })]));
    return;
  }
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(ws => { for(const w of ws){ if('focus' in w){ if(!url.includes('#treino')) w.navigate && w.navigate(url); return w.focus(); } } return clients.openWindow(url); }));
});
