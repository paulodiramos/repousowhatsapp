# Repouso WhatsApp Bot

Bot WhatsApp para o **Repouso Turístico**, usa `whatsapp-web.js` (WhatsApp Web).

## Deploy no Railway

1. Faz push deste código para o repo ligado ao Railway (`main` branch).
2. Nas **Variables** do serviço configura:
   - `BOT_API_KEY` — chave secreta (gera uma com 32+ caracteres). Vais usá-la no Emergent para autenticar.
   - `DATA_DIR` — `/data` (onde vive a sessão)
   - `DEFAULT_COUNTRY_CODE` — `351` (Portugal). Ajuda a normalizar números sem indicativo.
   - (opcional) `PORT` — Railway define automaticamente, não mexas.
3. Em **Settings → Volumes**:
   - Adiciona um **Volume** com Mount Path `/data`.
   - Isto é **crítico**: guarda a sessão WhatsApp entre deploys, para não teres de escanear o QR todas as vezes.
4. Em **Settings → Networking**:
   - Clica em **Generate Domain** para criar uma URL pública (ex: `repousowhastapp.up.railway.app`).

## Primeira ligação (escanear QR)

1. Depois do deploy, abre `https://<teu-domínio>.up.railway.app/qr` no browser.
2. Abre o WhatsApp no telemóvel → **Definições** → **Aparelhos ligados** → **Ligar um aparelho**.
3. Escaneia o QR. A página confirma "✅ Já ligado ao WhatsApp".
4. Nunca mais precisas de fazer isto (a sessão está no volume `/data`).

## Endpoints

| Método | Path | Auth | Descrição |
|---|---|---|---|
| GET | `/` | ❌ | Healthcheck |
| GET | `/status` | ❌ | Estado do bot |
| GET | `/qr` | ❌ | Página HTML com QR code (auto-refresh 30s) |
| POST | `/send` | ✅ | Enviar mensagem. Body: `{ "to": "912345678", "message": "Olá" }` |
| GET | `/check/:number` | ✅ | Verifica se o número tem WhatsApp |
| POST | `/logout` | ✅ | Termina sessão (para fazer login com outro número) |

Auth: header `x-api-key: <BOT_API_KEY>`.

## Exemplo (curl)

```bash
curl -X POST https://repousowhastapp.up.railway.app/send \
  -H "x-api-key: SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{"to":"912345678","message":"Olá! Reserva confirmada."}'
```

## Integrar com o Repouso Turístico (Emergent)

No backend Emergent, configurar as env vars:
```
WHATSAPP_BOT_URL=https://repousowhastapp.up.railway.app
WHATSAPP_BOT_API_KEY=a_mesma_chave_do_railway
```

## Avisos

- **Não é API oficial** do WhatsApp. Para grandes volumes, usa WhatsApp Business API (Twilio / Meta Cloud API).
- Usa um **número dedicado**, não o pessoal.
- Se o bot desligar, verifica se o volume está mesmo montado em `/data` (senão perdes a sessão).
