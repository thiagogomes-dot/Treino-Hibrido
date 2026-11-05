// Servidor de push do Treino TH (Cloudflare Worker, plano grátis).
// - POST /subscribe   {sub, am:'06:00', pm:'21:00', tz:-180}  → guarda/atualiza o celular
// - POST /unsubscribe {endpoint}                               → remove
// - POST /test        {endpoint}                               → manda um push na hora
// - cron a cada minuto: manda o lembrete da manhã e o da noite no horário de cada celular.
// Tudo fica numa única chave do KV ("subs"), para caber folgado nos limites grátis (1 leitura por minuto).
import { sendPush } from './webpush.js';

const KEY = 'subs';
const ALLOWED = ['https://thiagogomes-dot.github.io', 'http://localhost:8790', 'http://127.0.0.1:8790'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function cors(req){
  const o = req.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[0], 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type', 'Vary':'Origin' };
}
const json = (req, data, status = 200) => new Response(JSON.stringify(data), { status, headers:{ 'Content-Type':'application/json', ...cors(req) } });
const load = async env => (await env.SUBS.get(KEY, 'json')) || [];
const save = (env, list) => env.SUBS.put(KEY, JSON.stringify(list));
const vapid = env => ({ subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE });

// data e hora local do celular a partir do fuso (minutos, como Date.getTimezoneOffset: Brasília = 180)
function localNow(tz){
  const d = new Date(Date.now() - (tz || 0) * 60000);
  const day = d.toISOString().slice(0, 10);
  return { day, mins: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const toMins = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export default {
  async fetch(req, env){
    if(req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    const url = new URL(req.url);
    if(req.method === 'GET' && url.pathname === '/') return json(req, { ok:true, app:'Treino TH push' });
    if(req.method !== 'POST') return json(req, { error:'método' }, 405);
    if(!ALLOWED.includes(req.headers.get('Origin') || '')) return json(req, { error:'origem' }, 403);
    let b; try{ b = await req.json(); }catch(_){ return json(req, { error:'json' }, 400); }

    if(url.pathname === '/subscribe'){
      const s = b.sub;
      if(!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || !s.keys || !s.keys.p256dh || !s.keys.auth) return json(req, { error:'inscrição inválida' }, 400);
      const am = HHMM.test(b.am) ? b.am : '06:00', pm = HHMM.test(b.pm) ? b.pm : '21:00';
      const tz = Number.isFinite(b.tz) ? Math.max(-840, Math.min(840, Math.round(b.tz))) : 180;
      const list = await load(env);
      const old = list.find(x => x.sub.endpoint === s.endpoint);
      const item = { sub:{ endpoint:s.endpoint, keys:{ p256dh:s.keys.p256dh, auth:s.keys.auth } }, am, pm, tz, sent: old ? old.sent : {} };
      const next = list.filter(x => x.sub.endpoint !== s.endpoint).concat(item).slice(-10); // no máximo 10 aparelhos
      await save(env, next);
      return json(req, { ok:true, am, pm });
    }
    if(url.pathname === '/unsubscribe'){
      const list = await load(env);
      await save(env, list.filter(x => x.sub.endpoint !== b.endpoint));
      return json(req, { ok:true });
    }
    if(url.pathname === '/test'){
      const it = (await load(env)).find(x => x.sub.endpoint === b.endpoint);
      if(!it) return json(req, { error:'celular não inscrito' }, 404);
      const status = await sendPush(it.sub, { title:'Lembrete de teste ✅', body:'Os lembretes do Treino TH estão funcionando.', url:'./#treino' }, vapid(env));
      return json(req, { ok: status < 300, status });
    }
    return json(req, { error:'rota' }, 404);
  },

  async scheduled(_ev, env){
    const list = await load(env);
    if(!list.length) return;
    let changed = false;
    const keep = [];
    for(const it of list){
      const { day, mins } = localNow(it.tz);
      let dead = false;
      for(const slot of ['manha', 'noite']){
        const at = toMins(slot === 'manha' ? it.am : it.pm);
        // manda no minuto marcado; tolera até 20 min de atraso do cron, uma vez por dia
        if(mins >= at && mins < at + 20 && it.sent[slot] !== day){
          const status = await sendPush(it.sub, { slot }, vapid(env)).catch(() => 0);
          if(status === 404 || status === 410){ dead = true; break; }
          if(status && status < 300){ it.sent[slot] = day; changed = true; }
        }
      }
      if(dead){ changed = true; continue; }
      keep.push(it);
    }
    if(changed) await save(env, keep);
  }
};
