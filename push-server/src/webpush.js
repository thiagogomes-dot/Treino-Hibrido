// Web Push sem dependências, só WebCrypto (roda no Cloudflare Workers e no Node 20+).
// Criptografia aes128gcm (RFC 8291 / 8188) e assinatura VAPID ES256 (RFC 8292).

const enc = new TextEncoder();

export function b64uToBytes(s){
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
export function bytesToB64u(u8){
  let s = ''; for(const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const concat = (...arrs) => { const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0)); let o = 0; for(const a of arrs){ out.set(a, o); o += a.length; } return out; };

async function hmac(key, data){
  const k = await crypto.subtle.importKey('raw', key, { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** Criptografa o payload para uma inscrição {endpoint, keys:{p256dh, auth}}. */
export async function encryptPayload(sub, payload){
  const uaPublic = b64uToBytes(sub.keys.p256dh);
  const authSecret = b64uToBytes(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name:'ECDH', namedCurve:'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name:'ECDH', public:uaKey }, as.privateKey, 256));
  // IKM = HKDF(auth, ecdh, "WebPush: info\0" || ua || as, 32)
  const prkKey = await hmac(authSecret, ecdhSecret);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(payload), new Uint8Array([2])); // 0x02 = último registro, sem padding
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv:nonce }, key, plain));
  const header = new Uint8Array(21); header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096); header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/** Cabeçalho Authorization do VAPID. pub = chave pública (base64url, 65 bytes), priv = d (base64url). */
export async function vapidAuth(endpoint, subject, pub, priv){
  const pubBytes = b64uToBytes(pub);
  const jwk = { kty:'EC', crv:'P-256', d:priv, x:bytesToB64u(pubBytes.slice(1, 33)), y:bytesToB64u(pubBytes.slice(33, 65)), ext:true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name:'ECDSA', namedCurve:'P-256' }, false, ['sign']);
  const head = bytesToB64u(enc.encode(JSON.stringify({ typ:'JWT', alg:'ES256' })));
  const body = bytesToB64u(enc.encode(JSON.stringify({ aud:new URL(endpoint).origin, exp:Math.floor(Date.now()/1000) + 12*3600, sub:subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, key, enc.encode(head + '.' + body)));
  return `vapid t=${head}.${body}.${bytesToB64u(sig)}, k=${pub}`;
}

/** Envia um push. Devolve o status HTTP (201 = ok; 404/410 = inscrição morta). */
export async function sendPush(sub, data, { subject, publicKey, privateKey, ttl = 3600, urgency = 'high' }){
  const body = await encryptPayload(sub, JSON.stringify(data));
  const res = await fetch(sub.endpoint, {
    method:'POST',
    headers:{
      Authorization: await vapidAuth(sub.endpoint, subject, publicKey, privateKey),
      'Content-Encoding':'aes128gcm', 'Content-Type':'application/octet-stream',
      TTL:String(ttl), Urgency:urgency
    },
    body
  });
  return res.status;
}
