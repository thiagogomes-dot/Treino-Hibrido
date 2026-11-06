// Servidor de push do Treino TH e do Treino da Kika (Cloudflare Worker, plano grátis).
// Lembretes:
// - POST /subscribe   {sub, am:'06:00', pm:'21:00', tz:180, app?, uid?}  → guarda/atualiza o celular
// - POST /unsubscribe {endpoint}                                         → remove
// - POST /test        {endpoint}                                         → manda um push na hora
// - cron a cada minuto: manda o lembrete da manhã e o da noite no horário de cada celular.
// Comentários nos exercícios (app da Kika):
// - POST /note    {uid, ex, exName, text, rating, ctx} → avaliação do treino; guarda e devolve a resposta da IA grátis
// - POST /notes   {uid}                               → comentários desse aparelho, com as respostas
// - POST /approve {uid, id}                           → ela aprova a mudança sugerida
// - /admin/* (com ADMIN_TOKEN, usado pela revisão diária do Claude): notes, reply, applied
// Cada lista fica numa chave só do KV, para caber folgado nos limites grátis.
import { sendPush } from './webpush.js';

const KEY = 'subs';
const ALLOWED = ['https://thiagogomes-dot.github.io', 'http://localhost:8790', 'http://127.0.0.1:8790', 'http://localhost:8791'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const UID = /^[a-z0-9]{12,40}$/;
const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

function cors(req){
  const o = req.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[0], 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type, Authorization', 'Vary':'Origin' };
}
const json = (req, data, status = 200) => new Response(JSON.stringify(data), { status, headers:{ 'Content-Type':'application/json', ...cors(req) } });
const load = async env => (await env.SUBS.get(KEY, 'json')) || [];
const save = (env, list) => env.SUBS.put(KEY, JSON.stringify(list));
const vapid = env => ({ subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE });
const notesKey = uid => 'notes:' + uid;
const loadNotes = async (env, uid) => (await env.SUBS.get(notesKey(uid), 'json')) || [];
const saveNotes = (env, uid, list) => env.SUBS.put(notesKey(uid), JSON.stringify(list.slice(-300)));
const clip = (s, n) => String(s || '').slice(0, n);

// data e hora local do celular a partir do fuso (minutos, como Date.getTimezoneOffset: Brasília = 180)
function localNow(tz){
  const d = new Date(Date.now() - (tz || 0) * 60000);
  const day = d.toISOString().slice(0, 10);
  return { day, mins: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const toMins = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// resposta curta e imediata da IA grátis do Cloudflare
const AI_SYSTEM = `Você é a treinadora virtual do app "Treino da Kika". A Erika (Kika) treina musculação 4x por semana (inferior/superior),
com condromalácia patelar nos dois joelhos e hérnia de disco L5-S1. Regras do treino dela: nenhum exercício de perna passa de 90° de flexão do joelho,
coluna sempre neutra, miniband (elástico) nos exercícios de perna, progressão de carga só com técnica perfeita, dor aguda = parar.
Ela acabou de avaliar o treino do dia com uma nota de 1 a 5 estrelas e pode ter deixado comentários ou dúvidas.
Responda em português do Brasil, com carinho e objetividade, em no máximo 4 frases curtas: reconheça a avaliação,
responda as dúvidas dela de forma prática (técnica, amplitude, carga, cansaço, alternativa segura) e dê uma dica para o próximo treino. Se houver dor aguda, forte ou que piora, oriente parar e falar com o fisio/ortopedista.
Não invente diagnóstico. Não use listas nem markdown. À noite o Claude revisa com mais calma e pode sugerir mudar o treino; você pode dizer isso se fizer sentido.`;
async function aiReply(env, n){
  if(!env.AI) return null;
  const c = n.ctx || {};
  const user = `Treino avaliado: ${n.exName}. Nota: ${n.rating ? n.rating + ' de 5 estrelas' : 'sem nota'}.
Exercícios do treino: ${c.series || '-'}. Feito hoje: ${c.load || '-'}.
Fase do ciclo: ${c.phase || '-'}. Última dor registrada (0 a 10): ${c.pain ?? '-'}.
Comentários e dúvidas dela: "${n.text || '(sem comentário)'}"`;
  try{
    const r = await env.AI.run(AI_MODEL, { messages:[{ role:'system', content:AI_SYSTEM }, { role:'user', content:user }], max_tokens:260, temperature:.4 });
    return clip(r && (r.response || r.result || ''), 900).trim() || null;
  }catch(_){ return null; }
}

async function pushTo(env, filter, data){
  const list = await load(env);
  let sent = 0;
  for(const it of list.filter(filter)){ const st = await sendPush(it.sub, data, vapid(env)).catch(() => 0); if(st && st < 300) sent++; }
  return sent;
}

async function admin(req, env, url){
  if(!env.ADMIN_TOKEN || req.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_TOKEN) return json(req, { error:'não autorizado' }, 401);
  let b = {}; try{ b = await req.json(); }catch(_){}
  const index = (await env.SUBS.get('notes-index', 'json')) || [];
  if(url.pathname === '/admin/notes'){
    const out = [];
    for(const it of index){ out.push({ uid:it.uid, app:it.app, notes: await loadNotes(env, it.uid) }); }
    return json(req, { ok:true, devices:out });
  }
  if(url.pathname === '/admin/reply'){
    const list = await loadNotes(env, b.uid), n = list.find(x => x.id === b.id);
    if(!n) return json(req, { error:'comentário não encontrado' }, 404);
    n.claude = { text:clip(b.text, 2000), ts:Date.now() };
    if(b.change && b.change.summary) n.change = { summary:clip(b.change.summary, 400), detail:clip(b.change.detail, 1200), status:'proposta' };
    await saveNotes(env, b.uid, list);
    const pushed = await pushTo(env, x => x.uid === b.uid, { title:'O Claude respondeu seu comentário 💬', body:clip(n.exName + ': ' + n.claude.text, 140), url:'./#treino' });
    return json(req, { ok:true, pushed });
  }
  if(url.pathname === '/admin/applied'){
    const list = await loadNotes(env, b.uid), n = list.find(x => x.id === b.id);
    if(!n || !n.change) return json(req, { error:'sem mudança' }, 404);
    n.change.status = 'aplicada'; n.change.appliedTs = Date.now(); if(b.note) n.change.note = clip(b.note, 400);
    await saveNotes(env, b.uid, list);
    await pushTo(env, x => x.uid === b.uid, { title:'Treino atualizado ✅', body:clip(n.change.summary, 140), url:'./#treino' });
    return json(req, { ok:true });
  }
  return json(req, { error:'rota' }, 404);
}

export default {
  async fetch(req, env){
    if(req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    const url = new URL(req.url);
    if(req.method === 'GET' && url.pathname === '/') return json(req, { ok:true, app:'Treino TH push' });
    if(req.method !== 'POST') return json(req, { error:'método' }, 405);
    if(url.pathname.startsWith('/admin/')) return admin(req, env, url);
    if(!ALLOWED.includes(req.headers.get('Origin') || '')) return json(req, { error:'origem' }, 403);
    let b; try{ b = await req.json(); }catch(_){ return json(req, { error:'json' }, 400); }

    if(url.pathname === '/subscribe'){
      const s = b.sub;
      if(!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || !s.keys || !s.keys.p256dh || !s.keys.auth) return json(req, { error:'inscrição inválida' }, 400);
      const am = HHMM.test(b.am) ? b.am : '06:00', pm = HHMM.test(b.pm) ? b.pm : '21:00';
      const tz = Number.isFinite(b.tz) ? Math.max(-840, Math.min(840, Math.round(b.tz))) : 180;
      const list = await load(env);
      const old = list.find(x => x.sub.endpoint === s.endpoint);
      const item = { sub:{ endpoint:s.endpoint, keys:{ p256dh:s.keys.p256dh, auth:s.keys.auth } }, am, pm, tz, sent: old ? old.sent : {},
        app: clip(b.app, 20) || (old && old.app) || '', uid: UID.test(b.uid || '') ? b.uid : (old && old.uid) || '' };
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
      const status = await sendPush(it.sub, { title:'Lembrete de teste ✅', body:'Os lembretes estão funcionando.', url:'./#treino' }, vapid(env));
      return json(req, { ok: status < 300, status });
    }

    // ---- comentários nos exercícios
    if(url.pathname === '/note'){
      if(!UID.test(b.uid || '')) return json(req, { error:'aparelho inválido' }, 400);
      const text = clip(b.text, 1000).trim();
      const rating = Number.isInteger(b.rating) && b.rating >= 1 && b.rating <= 5 ? b.rating : null;
      if(!text && !rating && !(b.tags || []).length) return json(req, { error:'comentário vazio' }, 400);
      const list = await loadNotes(env, b.uid), today = new Date().toISOString().slice(0, 10);
      if(list.filter(x => x.date === today).length >= 25) return json(req, { error:'limite de comentários do dia' }, 429);
      const n = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts:Date.now(), date:clip(b.date, 10) || today,
        ex:clip(b.ex, 60), exName:clip(b.exName, 120), text, rating, tags:(b.tags || []).slice(0, 8).map(t => clip(t, 30)),
        ctx:{ series:clip(b.ctx && b.ctx.series, 600), obs:clip(b.ctx && b.ctx.obs, 300), load:clip(b.ctx && b.ctx.load, 300), phase:clip(b.ctx && b.ctx.phase, 40), pain: b.ctx && Number.isFinite(b.ctx.pain) ? b.ctx.pain : null, day:clip(b.ctx && b.ctx.day, 40) },
        ai:null, claude:null, change:null };
      const ai = await aiReply(env, n);
      if(ai) n.ai = { text:ai, ts:Date.now() };
      list.push(n); await saveNotes(env, b.uid, list);
      const index = (await env.SUBS.get('notes-index', 'json')) || [];
      if(!index.some(x => x.uid === b.uid)){ index.push({ uid:b.uid, app:clip(b.app, 20) || 'kika', since:Date.now() }); await env.SUBS.put('notes-index', JSON.stringify(index)); }
      return json(req, { ok:true, note:n });
    }
    if(url.pathname === '/notes'){
      if(!UID.test(b.uid || '')) return json(req, { error:'aparelho inválido' }, 400);
      return json(req, { ok:true, notes: await loadNotes(env, b.uid) });
    }
    if(url.pathname === '/approve'){
      if(!UID.test(b.uid || '')) return json(req, { error:'aparelho inválido' }, 400);
      const list = await loadNotes(env, b.uid), n = list.find(x => x.id === b.id);
      if(!n || !n.change) return json(req, { error:'sem mudança' }, 404);
      if(n.change.status === 'proposta'){ n.change.status = b.no ? 'recusada' : 'aprovada'; n.change.decidedTs = Date.now(); await saveNotes(env, b.uid, list); }
      return json(req, { ok:true, change:n.change });
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
