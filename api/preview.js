const MAX_BODY_BYTES = 12_000;

function clean(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function formatMoney(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getPreviewUrl(req) {
  if (process.env.PREVIEW_URL) return process.env.PREVIEW_URL;
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  return host ? `https://${host}/preview.html` : 'https://titans-studio.vercel.app/preview.html';
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
  if (!token) throw new Error('O envio automático pelo Discord ainda precisa conectar o bot Titans Studio. Escolha e-mail por enquanto.');
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
    throw new Error('O Discord não permitiu abrir uma DM. Confira o ID e as configurações de mensagens privadas do usuário.');
  }

  const messageResponse = await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
    method: 'POST', headers, body: JSON.stringify({ content: message.slice(0, 1900), allowed_mentions: { parse: [] } }),
  });
  if (!messageResponse.ok) throw new Error('Não foi possível entregar a prévia por DM no Discord. Confira o bot e as permissões.');
}

async function sendCustomerEmail(email, subject, text, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) throw new Error('O envio automático por e-mail ainda precisa ser configurado. Escolha Discord por enquanto.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject, text, html }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Resend recusou o e-mail:', detail.slice(0, 500));
    throw new Error('Não foi possível enviar o e-mail. Confira a chave, o remetente verificado e o endereço informado.');
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
  const channel = data.channel === 'discord' ? 'discord' : data.channel === 'email' ? 'email' : '';
  const contact = clean(data.contact, 200);
  const items = Array.isArray(data.items) ? data.items.slice(0, 30).map((item) => ({
    name: clean(item?.name, 100),
    quantity: Math.max(1, Math.min(99, Math.floor(Number(item?.quantity) || 1))),
    price: Math.max(0, Math.min(1_000_000, Number(item?.price) || 0)),
  })).filter((item) => item.name) : [];

  if (!name || !channel || !contact || !items.length) return res.status(400).json({ error: 'Preencha seu nome, contato e ao menos um produto.' });
  if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  if (channel === 'discord' && !/^\d{17,20}$/.test(contact)) return res.status(400).json({ error: 'Informe o ID numérico do Discord para receber a DM.' });

  const previewUrl = getPreviewUrl(req);
  const itemLines = items.map((item) => `${item.quantity}x ${item.name} — ${formatMoney(item.price * item.quantity)}`);
  const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const productList = itemLines.map((line) => `• ${line}`).join('\n');
  const subject = 'Sua prévia Titans Studio chegou';
  const text = [
    `Olá, ${name}!`,
    'A Titans Studio preparou uma prévia demonstrativa do seu pedido.',
    '', 'Itens:', productList,
    `Total demonstrativo: ${formatMoney(total)}`,
    '', `Acessar prévia: ${previewUrl}`,
    '', 'Esta página é uma demonstração visual temporária da loja.',
  ].join('\n');
  const html = [
    '<div style="font-family:Arial,sans-serif;background:#101113;color:#f5f5f5;padding:28px;border-radius:14px;max-width:620px;margin:auto">',
    '<p style="color:#fa3544;letter-spacing:2px;font-weight:bold">TITANS STUDIO</p>',
    `<h1 style="font-size:26px">Olá, ${escapeHtml(name)}!</h1>`,
    '<p>Sua prévia demonstrativa está pronta. Confira os itens selecionados e abra a demonstração pelo botão abaixo.</p>',
    `<ul>${items.map((item) => `<li>${item.quantity}x ${escapeHtml(item.name)} — ${escapeHtml(formatMoney(item.price * item.quantity))}</li>`).join('')}</ul>`,
    `<p><strong>Total demonstrativo:</strong> ${escapeHtml(formatMoney(total))}</p>`,
    `<p style="margin:28px 0"><a href="${escapeHtml(previewUrl)}" style="background:#ed2938;color:white;text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:bold">ABRIR MINHA PRÉVIA</a></p>`,
    '<p style="color:#a7a7a7;font-size:12px">Esta é uma demonstração visual temporária da Titans Studio.</p></div>',
  ].join('');
  const discordMessage = [
    `Olá, ${name}! A Titans Studio preparou uma prévia demonstrativa do seu pedido.`,
    '', productList,
    `Total demonstrativo: ${formatMoney(total)}`,
    '', `Acessar prévia: ${previewUrl}`,
    '', 'Esta página é uma demonstração visual temporária da loja.',
  ].join('\n');

  try {
    if (channel === 'email') await sendCustomerEmail(contact, subject, text, html);
    if (channel === 'discord') await sendCustomerDiscord(contact, discordMessage);

    const channelLabel = channel === 'email' ? `E-mail do cliente: ${contact}` : `Discord ID do cliente: ${contact}`;
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
    console.error('Falha na entrega da prévia:', error.message);
    const failedNotice = `Falha ao entregar uma prévia Titans Studio.\nNome: ${name}\nCanal: ${channel}\nContato informado: ${contact}\nMotivo: ${clean(error.message, 300)}`;
    try { await sendOwnerNotice(failedNotice); }
    catch (noticeError) { console.error('Também não foi possível enviar o aviso interno:', noticeError.message); }
    return res.status(502).json({ error: error.message || 'Não foi possível entregar a prévia agora. Tente novamente.' });
  }
};
