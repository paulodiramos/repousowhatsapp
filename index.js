const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const P = require('pino');
const QRCode = require('qrcode');
const express = require('express');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || '/data';
const AUTH_DIR = `${DATA_DIR}/baileys_auth`;
const API_KEY = process.env.BOT_API_KEY || '';
const PORT = process.env.PORT || 3000;
const DEFAULT_COUNTRY = process.env.DEFAULT_COUNTRY_CODE || '351';

try { fs.mkdirSync(AUTH_DIR, { recursive: true }); } catch (e) {}

let latestQr = null;
let clientReady = false;
let initError = null;
let sock = null;

console.log('[BOOT] A iniciar bot WhatsApp (Baileys)...');
console.log('[BOOT] DATA_DIR=', DATA_DIR);
console.log('[BOOT] PORT=', PORT);
console.log('[BOOT] BOT_API_KEY set?', !!API_KEY);

const logger = P({ level: 'warn' });

async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    console.log('[WA] Baileys version:', version);

    sock = makeWASocket({
      version,
      logger,
      auth: state,
      printQRInTerminal: false,
      browser: ['Repouso Turistico', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestQr = qr;
        clientReady = false;
        console.log('[WA] QR code recebido. Abre /qr no browser.');
      }

      if (connection === 'open') {
        clientReady = true;
        latestQr = null;
        initError = null;
        console.log('[WA] Bot READY — conectado ao WhatsApp');
      }

      if (connection === 'close') {
        clientReady = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[WA] Conexao fechada (status=${statusCode}). Reconectar? ${shouldReconnect}`);
        if (shouldReconnect) {
          setTimeout(startBot, 3000);
        } else {
          initError = 'Sessao terminada (logout). Apaga a pasta baileys_auth e re-faz scan.';
        }
      }
    });
  } catch (err) {
    initError = String(err);
    console.error('[WA] Init error:', err);
    setTimeout(startBot, 5000);
  }
}

startBot();

// -------------------- HTTP API --------------------
const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => res.json({
  ok: true,
  ready: clientReady,
  hasQr: !!latestQr,
  error: initError,
}));

app.get('/status', (_req, res) => res.json({
  ready: clientReady,
  hasQr: !!latestQr,
  error: initError,
}));

app.get('/qr', async (_req, res) => {
  if (clientReady) {
    return res.send('<h2 style="font-family:system-ui;text-align:center;padding:40px;color:#0a0">Ligado ao WhatsApp!</h2>');
  }
  if (!latestQr) {
    return res.send('<h2 style="font-family:system-ui;text-align:center;padding:40px">A inicializar, recarrega daqui a ~15s...</h2><script>setTimeout(()=>location.reload(),15000)</script>');
  }
  try {
    const dataUrl = await QRCode.toDataURL(latestQr, { width: 400, margin: 2 });
    res.send(`
      <html>
        <head><title>WhatsApp QR - Repouso</title><meta http-equiv="refresh" content="30"></head>
        <body style="font-family:system-ui;text-align:center;padding:30px;background:#111;color:#fff">
          <h2>Escaneia com WhatsApp</h2>
          <p>WhatsApp -> Definicoes -> Aparelhos ligados -> Ligar um aparelho</p>
          <img src="${dataUrl}" style="background:#fff;padding:20px;border-radius:8px"/>
          <p style="color:#888;font-size:12px">Auto-refresh a cada 30s</p>
        </body>
      </html>
    `);
  } catch (e) {
    res.status(500).send(String(e));
  }
});

function auth(req, res, next) {
  if (!API_KEY) return res.status(500).json({ error: 'BOT_API_KEY nao configurada' });
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function normalizeJid(to) {
  if (!to) return null;
  const s = String(to).trim();
  if (s.includes('@')) return s;
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length <= 9) digits = DEFAULT_COUNTRY + digits;
  return `${digits}@s.whatsapp.net`;
}

app.post('/send', auth, async (req, res) => {
  if (!clientReady || !sock) return res.status(503).json({ error: 'Bot ainda nao esta pronto' });
  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: 'to e message obrigatorios' });
  const jid = normalizeJid(to);
  if (!jid) return res.status(400).json({ error: 'Numero invalido' });
  try {
    const result = await sock.sendMessage(jid, { text: String(message) });
    res.json({ ok: true, id: result?.key?.id || null, to: jid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/check/:number', auth, async (req, res) => {
  if (!clientReady || !sock) return res.status(503).json({ error: 'Bot nao pronto' });
  try {
    const jid = normalizeJid(req.params.number);
    const results = await sock.onWhatsApp(jid);
    const found = Array.isArray(results) && results.length > 0 && results[0].exists;
    res.json({ exists: !!found, jid: found ? results[0].jid : null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/logout', auth, async (_req, res) => {
  try {
    if (sock) await sock.logout();
    clientReady = false;
    try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) {}
    res.json({ ok: true });
    setTimeout(startBot, 2000);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`[HTTP] A escutar em 0.0.0.0:${PORT}`));
