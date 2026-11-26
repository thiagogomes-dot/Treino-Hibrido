# CLAUDE.md — Pump & Pingo (Treino-Hibrido)

App web de treino do Thiago: musculação PPL (5 dias) + futevôlei 2x/semana, montado em torno de uma
tendinopatia bilateral nos joelhos. Publicado no GitHub Pages:
https://thiagogomes-dot.github.io/Treino-Hibrido/ (repo `thiagogomes-dot/Treino-Hibrido`, branch `main`).
Clone local neste PC: `C:\Users\Thiago Gomes\projetos\Treino-Hibrido` (criado em 2026-11-05).

## Como trabalhar aqui

- Responder em português do Brasil, curto e direto.
- **O Thiago aprova antes de qualquer mudança.** Propor, esperar o ok, só então editar. Nada de commit/push sem pedido.
- Documento longo para ele ler: página HTML, não `.md`.
- Não há build: é HTML/CSS/JS puro. O GitHub Pages publica direto da raiz do `main`.
- Depois de mudar `index.html` ou qualquer arquivo do cache, **subir a versão do `CACHE` em `sw.js`**
  (`pumppingo-vN`), senão o celular pode continuar com o arquivo velho.
- Testar sempre no celular instalado (Android Chrome e iPhone pela tela de início); o navegador do PC não reproduz
  as limitações de segundo plano.

## Objetivos do app (pedido do Thiago, 2026-11-05)

1. Funcionar como app independente no celular (PWA instalado), no Android e no iPhone.
2. Notificação push de **fim do descanso** entre séries, do próprio app (não o alarme do relógio).
3. **Dois lembretes de treino por dia**: o primeiro horário da manhã e o último horário da noite.

**Prioridade: Android primeiro** (Thiago, 2026-11-05). iPhone fica para depois.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | O app inteiro (~970 linhas): CSS, plano de treino, estado, telas, timer, push. |
| `sw.js` | Service worker: cache do app (rede primeiro), fontes Google em cache, recebe push dos lembretes, abre o app no clique. |
| `manifest.webmanifest` | Manifest PWA (`display: standalone`, retrato, ícones 192/512). |
| `push-server/` | **Servidor dos lembretes** (Cloudflare Worker, plano grátis). Ver "Lembretes" abaixo. |
| `icons/` | Ícones (192, 512, maskable, apple-touch, favicon, badge) + `avatar.svg` e o script `avatar-gerar.mjs`. |
| ~~`lembrete.mjs` + `package.json`~~ | Removidos em 2026-11-05 (caminho GitHub Actions abandonado; chave VAPID antiga perdida). |

## Lembretes (servidor de push)

- Cloudflare Worker `treino-th-push` na conta do Thiago (thisangom@gmail.com), escolhido em 2026-11-05 por ser
  grátis, pontual e aceitar horários do app. URL: https://treino-th-push.thisangom-91a.workers.dev
- Rotas: `POST /subscribe {sub, am, pm, tz}`, `POST /unsubscribe {endpoint}`, `POST /test {endpoint}`; só aceita
  origem `thiagogomes-dot.github.io` e `localhost:8790`. Cron a cada minuto manda `{slot:'manha'|'noite'}` no horário
  local de cada celular (tolera 20 min de atraso, 1 vez por dia). Tudo numa chave só do KV `SUBS` (`subs`) para caber
  nos limites grátis (1 leitura/min). 404/410 do serviço de push remove o celular.
- Web Push sem dependências em `push-server/src/webpush.js` (aes128gcm + VAPID ES256 com WebCrypto). Testado contra
  a biblioteca `http_ece` em 2026-11-05.
- Chaves VAPID novas (2026-11-05): pública no `index.html` e no `wrangler.toml`; **privada só em
  `~/.config/treino-th-vapid.json`** e no segredo `VAPID_PRIVATE` do Worker. Nunca no repositório.
- Publicar o Worker: em `push-server/`, `npx wrangler@4 deploy` (no PowerShell, `npx.cmd`; a política de scripts
  bloqueia `npx.ps1`). Login: `npx wrangler@4 login`. Logs ao vivo: `npx wrangler@4 tail`.
- No app (Ajustes): horários Manhã/Noite, Ativar/Testar/Desligar. Mudar horário reenvia ao servidor.
- Push do GitHub: `git push` pede login pelo Git Credential Manager no navegador (conta thiagogomes-dot).

Histórico: 5 commits de 2026-10-27, todos por upload na web do GitHub. O app nasceu como Artifact do claude.ai
(restos: `window.claude.use('db')`, `initDb`, "Salvo na sua conta"); no GitHub Pages esse caminho nunca roda.

## Como o app funciona (estado em 2026-11-05)

**Telas** (barra inferior, também por hash `#treino`, `#progresso`, `#joelho`, `#guia`):
- **Treino**: semana seg–dom com status; ficha do dia (PLAN fixo no código: seg Push, ter Pull + futevôlei,
  qua Legs + protocolo do joelho, qui Push + futevôlei, sex Pull + manutenção do joelho, sáb cardio opcional,
  dom descanso). Cada exercício: carga única, "Concluir série X de Y", desfazer, "última vez", link de execução no
  YouTube. Cartão "Treinou futevôlei?". Dor do joelho 0–10 opcional. "Concluir treino" grava a sessão.
- **Progresso**: calendário de check-ins (cores por tipo, bolinha de futevôlei, marcar/desmarcar dia manual),
  stats (check-ins, dias ativos, tempo), sequência de semanas com 4+ check-ins, totais do ciclo, gráfico de
  evolução de carga por exercício, histórico.
- **Joelho**: registro de dor com contexto (Futevôlei/Pós-treino/Outro), alerta se a média sobe 2 semanas
  seguidas, gráfico dos últimos 30 registros, protocolo.
- **Guia**: explicação do plano, regras de ouro.
- **Ajustes** (engrenagem): duração do ciclo (4–12 semanas), início, treinos anteriores, novo ciclo, avisos do
  descanso, manter tela ligada, "Push às 6h e às 19h", backup copiar/colar JSON.

**Dados**: só `localStorage` (`treino-hibrido-v1`, `treino-push`). Sem servidor nem conta. `seed31()` força, no
primeiro uso, o ciclo a ter começado 5 semanas antes com 30 treinos prévios (ajuste pessoal do Thiago).

**Timer de descanso**: `setInterval` na página. Descanso real = 60 s nos exercícios com `rest >= 90` e 45 s nos
outros (sobrescreve os valores do PLAN, linha ~370). No fim: bipe (AudioContext), `navigator.vibrate`, e
notificação local **só se a página estiver oculta e o JS ainda rodando**. Wake Lock opcional mantém a tela ligada.

## Diagnóstico das notificações (2026-11-05)

1. **O service worker não instala.** `sw.js` faz `cache.addAll` com `icons/maskable-512.png`, que dá 404 no site
   (o arquivo está na raiz). `addAll` falha → `install` falha → nenhum SW ativo. Consequências: sem offline,
   `navigator.serviceWorker.ready` nunca resolve (o botão "Ativar" do push trava sem mensagem), sem recebimento de
   push, e `notify()` cai no `new Notification()` (que no Android Chrome lança erro e no iOS não existe fora do SW).
2. **Não existe o agendador dos lembretes.** Não há `.github/workflows/`; o único workflow do repo é o do Pages.
   `lembrete.mjs` nunca roda. A tela fala em "passo 5 do guia" e "secret PUSH_SUB", mas esse guia não existe.
3. **Horários fixos**: a UI promete 6h e 19h, seg–sex. O pedido é primeiro horário da manhã e último da noite,
   provavelmente configurável. Cron do GitHub é em UTC (6h BRT = 09:00 UTC) e atrasa de minutos a mais de meia hora,
   às vezes pula execuções.
4. **Uma inscrição só**: `PUSH_SUB` é um secret com um aparelho. Celular novo, reinstalar o app ou a inscrição
   expirar (comum no iOS) exige copiar o código de novo à mão para o GitHub.
5. **Timer de descanso em segundo plano**: com a tela bloqueada ou o app em segundo plano, o navegador congela o
   JS (no iOS, imediatamente; no Android, com atraso/limitação). Então o aviso de fim do descanso só é confiável com
   o app aberto e a tela ligada. Para notificar com a tela bloqueada é preciso **push enviado por um servidor** no
   horário certo (Notification Triggers não existe mais em nenhum navegador).
6. `mailto:treino@example.com` como sujeito VAPID: funciona no FCM, mas o push da Apple pode recusar sujeito
   inválido; usar um e-mail real ou a URL do site.

## Limitações do iOS (Safari/WebKit)

- Push na web só a partir do **iOS 16.4** e **só com o app adicionado à tela de início** (Compartilhar → Adicionar à
  Tela de Início) e aberto por lá. No Safari normal, `Notification` nem existe.
- A permissão precisa ser pedida num toque do usuário, dentro do app instalado.
- Não há notificação agendada local: tudo que toca com o app fechado precisa vir de um servidor de push.
  Cada push precisa mostrar uma notificação (sem push silencioso); o iOS pode cancelar a inscrição se não mostrar.
- Sem `navigator.vibrate`; `icon`/`badge`/`vibrate` da notificação são ignorados; som é o padrão do sistema.
- JS para logo que o app vai para segundo plano; AudioContext também.
- Wake Lock existe desde o 16.4, mas no app da tela de início só ficou confiável no iOS 18.4.
- `localStorage` do app instalado é separado do Safari e pode ser apagado se o app ficar muito tempo sem uso
  ou faltar espaço. Backup é importante.

## Manifest e instalação

- Chaves `background_color` e `theme_color` duplicadas (valem as últimas, `#0f0f12`, diferentes do `#07060d` do app).
- Ícones com `"purpose": "any maskable"` juntos (desaconselhado); o `maskable-512.png` existe mas não é usado.
- Faltam `id`, `lang`, `description`; não há botão de instalar (`beforeinstallprompt`) nem instrução para o iPhone.
- `index.html` declara dois `apple-touch-icon` e dois `icon`; falta `apple-mobile-web-app-status-bar-style`.

## Mudanças de 2026-11-05 (aprovadas pelo Thiago; ainda não publicadas)

- Nome **Treino TH** (manifest, título, cabeçalho). Ícone = avatar do Thiago desenhado por script, no estilo do app
  da Erika (`treino-da-kika`): olhos fechados sorrindo, cabelo castanho escuro liso em mechas (risca do lado,
  penteado para trás até a orelha, "old money"; desenhar em mechas, não em riscos, senão vira peruca), bigode
  grosso colado na boca, cavanhaque curto, camiseta preta, braços cruzados com relógio/pulseira/tatuagem,
  fundo roxo do app, sombreado "um pouco 3D". Fonte: `icons/avatar-gerar.mjs` → `icons/avatar.svg`; PNGs com resvg.
  Escolhido pelo Thiago em 2026-11-05 (rosto da v1 + fundo da v2 + braços da v3). **Sem gastar nada**: nada de
  geração paga de imagem, e nunca ElevenLabs. `icons/badge-96.png` = "TH" branco (badge do Android).
- `sw.js` (`treinoth-v9`): cache arquivo a arquivo (404 não derruba mais a instalação); **aviso do fim do descanso
  pelo SW**: a página manda `{type:'rest', end, next}` via `postMessage`, o SW espera com `waitUntil` e mostra a
  notificação se nenhuma janela estiver visível (`force:true` no teste). `rest-cancel` cancela.
- Timer: vermelho e pulsando nos últimos 10 s ("Prepare-se"), bipe + vibração em 3-2-1, alarme bem mais alto
  (ondas quadradas, ganho 2,2 + compressor). Pede permissão de notificação no primeiro "Concluir série".
- Ajustes: instalar app, testar aviso (5 s), testar som, horários dos lembretes (manhã/noite, padrão 06:00/21:00,
  em `S.program.remind`), inscrição de push (o servidor que lê esses horários ainda não existe).
- Cartão "Instale o Treino TH" na tela Treino quando há `beforeinstallprompt` (dispensável).
- Removido o código do Artifact (`window.claude`, `initDb`). `navigator.storage.persist()` no boot.
- Manifest refeito (`id`, `lang`, maskable separado, cores únicas). Ícones duplicados da raiz e `icon.svg` removidos.
- `lembrete.mjs`: sujeito VAPID passou a ser a URL do site.
- Teste local: `.claude/launch.json` de `K:\CLAUDE` tem a config `treino-th` (http-server na porta 8790).

## Mudanças publicadas depois (2026-11-05)

- Lembretes testados no celular do Thiago: funcionando.
- Contagem do descanso na tela de bloqueio (substitui o widget, que o Chrome Android não permite para PWA):
  notificação silenciosa "Descanso · 0:45" com barra ▰▱ e próximo exercício, atualiza a cada 5 s (1 s nos últimos
  10), botões +15 s e Pular (sincronizam o timer do app por `postMessage` `rest-sync`/`rest-skip`), vira alarme no zero.
- Tela de abertura (`#intro`): avatar, "Treino TH", "PPL 5x + futevôlei 2x, com o joelho protegido.", semana do
  ciclo e treino do dia; fica até o toque ("Toque para começar") ou some sozinha em 10 s (~~1,7 s~~, pedido do Thiago 2026-11-05); pulada quando o app abre com hash (notificação).
- **Spotify** (2026-11-05, testado no celular do Thiago: funcionando): app "Treino TH" no developer.spotify.com da conta do Thiago (Premium), só Web API.
  Client ID `97a18fb0dd514659bee6f6bfecaad08b` (público; o secret não é usado). Redirect URIs cadastradas:
  `https://thiagogomes-dot.github.io/Treino-Hibrido/` e `http://127.0.0.1:8790/` (o Spotify não aceita `localhost`).
  Login PKCE direto do app (`spConnect`/`spHandleRedirect`), token em `localStorage` `treino-sp`. Mini player na aba
  Treino (`#spcard`), atualiza a cada 5 s; ⏮ ⏯ ⏭; sem aparelho ativo, transfere para o Smartphone (`spWake`).
  Escopos: user-read-playback-state, user-modify-playback-state, user-read-currently-playing.
- Próximo: iPhone.

## Em aberto

- Onde hospedar o servidor de push (Cloudflare Worker com Cron + KV é gratuito e serve para descanso e lembretes;
  GitHub Actions só serve para lembretes e é impreciso). Decisão do Thiago.
- "Primeiro horário da manhã e último da noite": horários fixos escolhidos nos Ajustes, ou derivados de algo?
- Os lembretes devem valer todos os dias ou só nos dias de treino (seg–sex, sábado opcional)?

## Trocar de treino (novo ciclo)

O plano fica na constante `PLAN` de `index.html` (um objeto por dia, com a lista de exercícios). Para trocar:
1. Receber o treino novo (foto, PDF ou texto do professor, ou montar junto), mostrar a proposta e esperar a aprovação.
2. Reescrever só o `PLAN` (e o texto do Guia, se mudar a lógica). **Manter o mesmo `id` para o exercício que
   continua** (assim o histórico de carga e o gráfico de evolução seguem), e usar `id` novo só para exercício novo.
3. Subir a versão do `CACHE` no `sw.js`, testar no navegador local, publicar.
4. No app: Ajustes → "Começar novo ciclo hoje" (zera o contador de semanas; o histórico fica).

## Recordes, sugestão de carga e resumo da semana (2026-11-05)

- **Recordes** (`findPRs`): ao concluir o treino, maior carga do exercício (ou mais reps com a carga recorde) vs
  histórico; o primeiro registro não conta. Ficam em `sess.prs`, aparecem no cartão de concluído e no histórico (🏆).
- **Sugestão de carga** (`sugLoad`/`sugHtml`, botão "Usar"): 2 treinos completos seguidos com a mesma carga →
  sobe um passo (`INC`: 2,5 kg no Treino TH, 2 kg na Kika; 5 lb se o exercício estiver em libras). Dor ≥ 5 nos
  últimos 7 dias → manter. Série incompleta → manter.
- **Resumo da semana**: cartão "Esta semana" em Progresso (`weekCard`); o app manda o texto (`POST /summary`) ao
  abrir e ao concluir treino, e o Worker envia o push no domingo às 20h (hora local), só para celulares com lembretes ativos.

## App para outras pessoas: cadastro e perfil (2026-11-23)

Pedido do Thiago: mandar o mesmo link para um amigo, que faz o cadastro, manda o treino dele e o app se ajusta.
- **Perfil** em `localStorage` `treino-perfil`. Sem perfil e com dados antigos = celular do Thiago (`{kind:'th'}`, tudo
  como antes, `PLAN_TH`). Aparelho sem nada = cadastro (`#onb`). `?perfil=th` força o perfil do Thiago num aparelho novo
  (ou "Restaurar um backup" na primeira tela).
- Perfil `custom`: nome, objetivo, dor/lesão (opcional), esporte e dias (opcional), `workouts` (A, B, C… com dias da
  semana). `buildPlan()` monta o `PLAN` da semana; cada treino vira um tipo `w0`, `w1`… com cor própria.
- O app se ajusta: aba "Dor" só com lesão; cartão do esporte no lugar do futevôlei (emoji pelo nome); avatar com
  iniciais; Guia gerado (`viewGuiaApp`); Spotify escondido; avaliações com `app:'livre'` (só a resposta da IA, sem a
  revisão das 22h); ícone neutro (haltere) em `manifest-app.webmanifest` + `icons/app-*.png` (`icons/app-gerar.mjs`).
- **Treino entra por**: foto (câmera), prints (até 6), arquivo (PDF, DOCX, XLSX/XLS/ODS/CSV, TXT), colar texto,
  modelo pronto (ABC, Full body, Superior/Inferior) ou na mão. Depois, tela de conferência (editor) antes de salvar.
- Leitura: `POST /plano` no Worker (foto → Llama 4 Scout transcreve, com Mistral Small 3.1 de reserva; texto → Llama
  3.3 70B devolve JSON; 20 leituras/aparelho/dia). Se o servidor falhar ou sem internet: OCR Tesseract no celular +
  leitor de texto próprio (`localParse`). Bibliotecas carregadas sob demanda (pdf.js, mammoth, SheetJS, Tesseract).
- Ajustes de quem fez o cadastro: Editar treino, Trocar treino (ciclo novo), Meus dados. Todos: "Compartilhar".
- Testado no navegador local em 2026-11-23 (cadastro, texto colado, foto pelo OCR, Excel, modelo, perfil do Thiago
  intacto). **A IA do `/plano` só foi testada com IA simulada**: conferir depois de publicar o Worker.

### Marca de amigo (`?treino=<chave>`, 2026-11-23)
- `AMIGOS` no `index.html`: nome do app, pasta `amigos/<chave>/` (ícones, `manifest.webmanifest` com
  `start_url ../../?amigo=<chave>`, `intro.mp4`). O link grava a chave em `localStorage` `treino-amigo` e o cadastro
  guarda em `PF.brand`. Só vale para perfil `custom` (o celular do Thiago ignora).
- Primeiro: **Mauricio Prado** (chave `mp`, link `?treino=mp`, pasta `amigos/mauricio/`; personal, https://mpradopersonal.com.br/): "Treino MP". O app inteiro usa as cores dele (`theme` em `AMIGOS`: fundo #111214, laranja de destaque, paleta laranja/areia nos treinos); a abertura termina em #111214, monograma MP do site, preto
  #17191b, laranja #ff6a13, areia #e9e2d4. Ícone: `amigos/mauricio/_src/icone.py a|b|c` (opções em `_src/opcoes.png`).
  Abertura em Remotion (3,5 s, 720×1280, 317 KB): projeto em `~/Videos/mauricio-intro` (node_modules = junção para o
  template da skill `video-animado`); render `npx remotion render src/index.ts Intro out/intro.mp4 --codec=h264 --crf=26 --scale=0.6666666666666666`.

## Trocar o treino de hoje (2026-11-05)

- `todayPlan()` = treino de hoje: o do dia da semana, ou o escolhido em "🔁 Trocar treino" (`S.program.swap =
  {date, day}`, vale só no dia). Lista mostra primeiro os treinos não feitos nesta semana. Em outro dia da barra:
  "Fazer este treino hoje". `swapBar(day)` fica no topo do treino.
- Na barra da semana o treino fica marcado **no dia em que foi feito** (com a cor do treino feito); o dia trocado fica em branco (pedido do Thiago). `weekDone` só serve para a lista de troca ("não feito nesta semana").

## GIFs de execução (2026-11-26)
- Só no Treino TH (`isTH()`): `GIFS` em index.html liga o id do exercício ao id do ExerciseDB (API grátis `oss.exercisedb.dev`, GIF 180 px em `static.exercisedb.dev/media/<id>.gif`). 29 de 30 exercícios; `excentrico` fica sem (só YouTube).
- Cada GIF foi conferido quadro a quadro: o nome em inglês erra (ex.: "cable lat pulldown full range of motion" é um crossover). Exercício novo = conferir antes de pôr no mapa.
- Cartão aberto mostra o GIF; tocar amplia (`.gifbig`). Os GIFs do treino do dia já carregam ao abrir a tela (img em `display:none` também baixa).
- sw.js guarda os GIFs no cache `treino-gifs` (não é apagado na troca de versão). Se o servidor cair, a imagem some sozinha (`onerror`) e fica só o YouTube.
- Licença dos GIFs não confirmada (termos do ExerciseDB não abriram). Por isso não vai para perfis de amigos (Treino MP) por enquanto.
