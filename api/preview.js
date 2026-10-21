const MAX_BODY_BYTES = 12_000;
const PREVIEW_CODE_TTL = 60 * 60;
const PREVIEW_SESSION_TTL = 20 * 60;
const crypto = require('node:crypto');

function clean(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function formatMoney(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getPreviewUrl(req) {
  if (process.env.PREVIEW_URL) return process.env.PREVIEW_URL;
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  return host ? `https://${host}/preview.html` : 'https://titans-studio.vercel.app/preview.html';
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('A proteção da prévia ainda não foi configurada. Avise a TITANS STUDIO.');
  return { url: url.replace(/\/+$/, ''), token };
}

async function redisCommand(command) {
  const { url, token } = redisConfig();
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error('O armazenamento temporário da prévia está indisponível.');
  return result.result;
}

function getLoginUrl(req, code) {
  const parsed = new URL('/api/preview-login', getPreviewUrl(req));
  parsed.searchParams.set('code', code);
  return parsed.toString();
}

async function createPreviewAccess({ name, channel, contact, items, total }) {
  const code = crypto.randomBytes(32).toString('base64url');
  const orderCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  const payload = JSON.stringify({ name, channel, contact, items, total, orderCode, issuedAt: Date.now() });
  const stored = await redisCommand(['SET', `ts:preview:code:${code}`, payload, 'EX', PREVIEW_CODE_TTL, 'NX']);
  if (stored !== 'OK') throw new Error('Não foi possível gerar o código individual da prévia. Tente novamente.');
  return { code, orderCode };
}

async function sendOwnerNotice(text) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }),
  });
  if (!response.ok) throw new Error('Não foi possível avisar o canal interno da loja.');
}

async function sendCustomerDiscord(userId, message) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('O envio automático pelo Discord ainda precisa conectar o bot Titans Studio.');
  if (!/^\d{17,20}$/.test(userId)) throw new Error('Para receber pelo Discord, informe o ID numérico do usuário, não o nome ou convite.');

  const headers = {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'TitansStudioPreviewBot (https://titans-studio.vercel.app, 1.0)',
  };
  const dmResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST', headers, body: JSON.stringify({ recipient_id: userId }),
  });
  const dm = await dmResponse.json().catch(() => ({}));
  if (!dmResponse.ok || !dm.id) {
    const discordCode = Number(dm.code) || 0;
    console.error('Discord recusou a criação da DM:', {
      httpStatus: dmResponse.status,
      discordCode,
      message: clean(dm.message || 'Sem descrição retornada pela API.', 240),
    });
    if (dmResponse.status === 401) {
      throw new Error('O token do bot configurado na Vercel foi recusado. Confira se DISCORD_BOT_TOKEN é do bot Titans Studio e atualize o deploy.');
    }
    if (discordCode === 50007) {
      throw new Error('O Discord recusou a DM (código 50007). As permissões estão ligadas; confira se o ID é da conta correta, se o bot está no mesmo servidor e se a conta não bloqueou o bot.');
    }
    if (discordCode === 10013 || dmResponse.status === 404) {
      throw new Error('O Discord não encontrou esse usuário. Confira o ID numérico copiado do perfil da conta que receberá a prévia.');
    }
    throw new Error(`O Discord recusou a DM (HTTP ${dmResponse.status}, código ${discordCode || 'não informado'}). Confira o token do bot, o ID e se os dois estão no mesmo servidor.`);
  }

  const messageResponse = await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
    method: 'POST', headers, body: JSON.stringify({ content: message.slice(0, 1900), allowed_mentions: { parse: [] } }),
  });
  if (!messageResponse.ok) {
    const failure = await messageResponse.json().catch(() => ({}));
    console.error('Discord recusou o envio da mensagem:', {
      httpStatus: messageResponse.status,
      discordCode: Number(failure.code) || 0,
      message: clean(failure.message || 'Sem descrição retornada pela API.', 240),
    });
    throw new Error(`A DM abriu, mas o Discord recusou a mensagem (HTTP ${messageResponse.status}, código ${Number(failure.code) || 'não informado'}). Confira os registros do bot.`);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  let data;
  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'Solicitação muito grande.' });
    data = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Não foi possível ler a solicitação.' });
  }

  const name = clean(data.name, 100);
  const channel = data.channel === 'discord' ? 'discord' : '';
  const contact = clean(data.contact, 200);
  const items = Array.isArray(data.items) ? data.items.slice(0, 30).map((item) => ({
    name: clean(item?.name, 100),
    quantity: Math.max(1, Math.min(99, Math.floor(Number(item?.quantity) || 1))),
    price: Math.max(0, Math.min(1_000_000, Number(item?.price) || 0)),
  })).filter((item) => item.name) : [];

  if (!name || !channel || !contact || !items.length) return res.status(400).json({ error: 'Preencha seu nome, ID do Discord e ao menos um produto.' });
  if (channel === 'discord' && !/^\d{17,20}$/.test(contact)) return res.status(400).json({ error: 'Informe o ID numérico do Discord para receber a DM.' });

  const itemLines = items.map((item) => `${item.quantity}x ${item.name} — ${formatMoney(item.price * item.quantity)}`);
  const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const productList = itemLines.map((line) => `• ${line}`).join('\n');
  let access;
  let previewUrl;
  try {
    access = await createPreviewAccess({
      name,
      channel,
      contact,
      items: items.map(({ name: itemName, quantity, price }) => ({ name: itemName, quantity, price })),
      total,
    });
    previewUrl = getLoginUrl(req, access.code);
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Não foi possível preparar a prévia protegida.' });
  }
  const discordMessage = [
    `Olá, ${name}! A Titans Studio preparou uma prévia demonstrativa do seu pedido.`,
    `Identificador da prévia: #${access.orderCode}`,
    '', productList,
    `Total demonstrativo: ${formatMoney(total)}`,
    '', `Acessar prévia: ${previewUrl}`,
    '', 'Esta página é uma demonstração visual temporária da loja.',
  ].join('\n');

  try {
    if (channel === 'discord') await sendCustomerDiscord(contact, discordMessage);

    const channelLabel = `Discord ID do cliente: ${contact}`;
    const notice = [
      'Prévia Titans Studio entregue ao cliente',
      `Nome: ${name}`,
      channelLabel,
      '', 'Produtos:', productList,
      `Total demonstrativo: ${formatMoney(total)}`,
    ].join('\n');
    try { await sendOwnerNotice(notice); }
    catch (noticeError) { console.error('A prévia foi entregue, mas o aviso interno falhou:', noticeError.message); }
    return res.status(200).json({ ok: true, channel, previewUrl });
  } catch (error) {
    if (access?.code) {
      try { await redisCommand(['DEL', `ts:preview:code:${access.code}`]); } catch (cleanupError) { console.error('Não foi possível invalidar o código da prévia:', cleanupError.message); }
    }
    console.error('Falha na entrega da prévia:', error.message);
    const failedNotice = `Falha ao entregar uma prévia Titans Studio.\nNome: ${name}\nCanal: ${channel}\nContato informado: ${contact}\nMotivo: ${clean(error.message, 300)}`;
    try { await sendOwnerNotice(failedNotice); }
    catch (noticeError) { console.error('Também não foi possível enviar o aviso interno:', noticeError.message); }
    return res.status(502).json({ error: error.message || 'Não foi possível entregar a prévia agora. Tente novamente.' });
  }
};
