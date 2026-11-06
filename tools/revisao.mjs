// Apoio da revisão diária do Claude (avaliações de treino do Treino TH).
// Lê o token de ~/.config/treino-th-admin.txt (nunca no repositório).
//   node tools/revisao.mjs pendentes          → avaliações sem resposta do Claude + mudanças aprovadas por aplicar (JSON)
//   node tools/revisao.mjs todas              → tudo (para ver o histórico)
//   node tools/revisao.mjs responder <arquivo.json>   → {uid, id, text, change?:{summary, detail}}
//   node tools/revisao.mjs aplicada <arquivo.json>    → {uid, id, note?}
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const API = 'https://treino-th-push.thisangom-91a.workers.dev';
const APP = 'th'; // só as avaliações deste app
const TOKEN = readFileSync(homedir() + '/.config/treino-th-admin.txt', 'utf8').trim();
const call = async (path, body = {}) => {
  const r = await fetch(API + path, { method:'POST', headers:{ Authorization:'Bearer ' + TOKEN, 'Content-Type':'application/json' }, body:JSON.stringify(body) });
  const j = await r.json(); if(!r.ok) throw new Error(path + ' ' + r.status + ' ' + JSON.stringify(j)); return j;
};
const [cmd, file] = process.argv.slice(2);
if(cmd === 'pendentes' || cmd === 'todas'){
  const { devices } = await call('/admin/notes');
  const out = devices.filter(d => d.app === APP).map(d => ({ uid:d.uid, app:d.app, notes: cmd === 'todas' ? d.notes : d.notes.filter(n => !n.claude || (n.change && n.change.status === 'aprovada')) })).filter(d => d.notes.length);
  console.log(JSON.stringify(out, null, 1));
} else if(cmd === 'responder'){
  console.log(JSON.stringify(await call('/admin/reply', JSON.parse(readFileSync(file, 'utf8')))));
} else if(cmd === 'aplicada'){
  console.log(JSON.stringify(await call('/admin/applied', JSON.parse(readFileSync(file, 'utf8')))));
} else {
  console.log('uso: pendentes | todas | responder <arquivo.json> | aplicada <arquivo.json>');
}
