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

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const configured = Boolean(process.env.DISCORD_WEBHOOK_URL || (process.env.RESEND_API_KEY && process.env.STORE_EMAIL && process.env.RESEND_FROM));
  if (!configured) {
    return res.status(503).json({ error: 'O recebimento da loja ainda não foi configurado. Avise a Titans Studio por outro canal.' });
  }

  let rawBody;
  try {
    rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'Solicitação muito grande.' });
  } catch {
    return res.status(400).json({ error: 'Não foi possível ler a solicitação.' });
  }

  let data;
  try { data = JSON.parse(rawBody); } catch { return res.status(400).json({ error: 'Dados inválidos.' }); }

  const name = clean(data.name, 100);
  const channel = data.channel === 'discord' ? 'Discord' : data.channel === 'email' ? 'E-mail' : '';
  const contact = clean(data.contact, 200);
  const items = Array.isArray(data.items) ? data.items.slice(0, 30).map((item) => ({
    name: clean(item?.name, 100),
    quantity: Math.max(1, Math.min(99, Math.floor(Number(item?.quantity) || 1))),
    price: Math.max(0, Math.min(1_000_000, Number(item?.price) || 0)),
  })).filter((item) => item.name) : [];

  if (!name || !channel || !contact || !items.length) return res.status(400).json({ error: 'Preencha seu nome, contato e ao menos um produto.' });
  if (channel === 'E-mail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return res.status(400).json({ error: 'Informe um e-mail válido.' });

  const itemLines = items.map((item) => `• ${item.quantity}x ${item.name} — ${formatMoney(item.price * item.quantity)}`);
  const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const subject = `Nova solicitação de prévia — ${name}`;
  const text = [
    'Nova solicitação de prévia — Titans Studio',
    `Nome: ${name}`,
    `Contato preferido (${channel}): ${contact}`,
    '', 'Produtos:', ...itemLines,
    `Total demonstrativo: ${formatMoney(total)}`,
  ].join('\n');

  const tasks = [];
  if (process.env.DISCORD_WEBHOOK_URL) {
    tasks.push(fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }),
    }).then((response) => {
      if (!response.ok) throw new Error('Discord recusou o envio. Confira o webhook nas variáveis da Vercel.');
    }));
  }

  if (process.env.RESEND_API_KEY && process.env.STORE_EMAIL && process.env.RESEND_FROM) {
    const html = [
      `<h2>${escapeHtml(subject)}</h2>`,
      `<p><strong>Nome:</strong> ${escapeHtml(name)}<br><strong>Contato preferido (${escapeHtml(channel)}):</strong> ${escapeHtml(contact)}</p>`,
      '<h3>Produtos</h3><ul>',
      ...items.map((item) => `<li>${item.quantity}x ${escapeHtml(item.name)} — ${escapeHtml(formatMoney(item.price * item.quantity))}</li>`),
      `</ul><p><strong>Total demonstrativo:</strong> ${escapeHtml(formatMoney(total))}</p>`,
    ].join('');
    tasks.push(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.RESEND_FROM, to: [process.env.STORE_EMAIL], subject, text, html }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Serviço de e-mail recusou o envio. Confira as variáveis da Vercel.');
    }));
  }

  try {
    await Promise.all(tasks);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Falha ao enviar solicitação de prévia:', error.message);
    return res.status(502).json({ error: 'Não conseguimos entregar a solicitação agora. Tente novamente em alguns minutos.' });
  }
};
