import webpush from 'web-push';
const slot = process.env.SLOT || 'manha';
const sub = JSON.parse(process.env.PUSH_SUB);
webpush.setVapidDetails('https://thiagogomes-dot.github.io/Treino-Hibrido/', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
await webpush.sendNotification(sub, JSON.stringify({ slot }), { TTL: 3600, urgency: 'high' });
console.log('Lembrete enviado:', slot);
