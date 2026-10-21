const crypto = require('node:crypto');

const SESSION_TTL = 20 * 60;
const COOKIE_NAME = 'titans_preview';

function query(req, name) {
  if (typeof req.query?.[name] === 'string') return req.query[name];
  try { return new URL(req.url, 'https://titans-studio.invalid').searchParams.get(name) || ''; } catch { return ''; }
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('A proteção da prévia ainda não está configurada.');
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

function fail(res, status, message) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return res.status(status).send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Prévia Titans Studio</title><body style="margin:0;background:#101113;color:#f5f5f5;font:16px Arial;padding:12vh 8vw"><h1>Prévia Titans Studio</h1><p>${message}</p><p>Volte à loja e solicite uma nova prévia, se necessário.</p></body></html>`);
}

async function notifyOwner(payload) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: [
        'Prévia individual aberta após login Discord',
        `Pedido: #${payload.orderCode}`,
        `Cliente informado: ${payload.name}`,
        `Conta autenticada: ${payload.discordUsername} (${payload.discordId})`,
        'O link foi resgatado e a sessão temporária começou.',
      ].join('\n'),
      allowed_mentions: { parse: [] },
    }),
  });
  if (!response.ok) throw new Error('Falha ao enviar aviso de acesso ao canal interno.');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Método não permitido.');
  }

  if (query(req, 'error')) return fail(res, 403, 'O login do Discord foi cancelado. Abra novamente a mensagem da Titans Studio.');

  try {
    const oauthCode = query(req, 'code');
    const state = query(req, 'state');
    if (!oauthCode || !/^[A-Za-z0-9_-]{30,80}$/.test(state)) return fail(res, 400, 'A resposta do Discord está incompleta. Abra novamente o link enviado por DM.');

    const takeState = [
      "local value = redis.call('GET', KEYS[1])",
      'if not value then return false end',
      "redis.call('DEL', KEYS[1])",
      'return value',
    ].join('\n');
    const previewCode = await redisCommand(['EVAL', takeState, 1, `ts:preview:oauth-state:${state}`]);
    if (!previewCode) return fail(res, 410, 'Este login já foi usado ou expirou. Abra novamente o link enviado por DM.');

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) return fail(res, 503, 'O login seguro do Discord ainda não foi configurado pela Titans Studio.');

    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: oauthCode,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) return fail(res, 401, 'O Discord não confirmou o login. Abra novamente o link enviado por DM.');

    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userResponse.json().catch(() => ({}));
    if (!userResponse.ok || !/^\d{17,20}$/.test(user.id || '')) return fail(res, 401, 'Não foi possível confirmar sua conta Discord.');

    const sessionId = crypto.randomBytes(32).toString('base64url');
    const sessionExpiry = Date.now() + SESSION_TTL * 1000;
    const script = [
      "local data = redis.call('GET', KEYS[1])",
      'if not data then return false end',
      'local payload = cjson.decode(data)',
      "if payload.contact ~= ARGV[2] then return 'MISMATCH' end",
      'payload.discordId = ARGV[2]',
      'payload.discordUsername = ARGV[3]',
      'payload.sessionExpiry = tonumber(ARGV[4])',
      'local session = cjson.encode(payload)',
      "redis.call('SET', KEYS[2], session, 'EX', ARGV[1])",
      "redis.call('DEL', KEYS[1])",
      'return session',
    ].join('\n');
    const username = String(user.global_name || user.username || 'Discord').slice(0, 100);
    const sessionData = await redisCommand([
      'EVAL', script, 2,
      `ts:preview:code:${previewCode}`,
      `ts:preview:session:${sessionId}`,
      SESSION_TTL,
      user.id,
      username,
      sessionExpiry,
    ]);
    if (sessionData === 'MISMATCH') return fail(res, 403, 'Essa prévia foi solicitada por outra conta Discord. Entre com a mesma conta que recebeu a DM.');
    if (!sessionData) return fail(res, 410, 'Esse link já foi usado ou expirou. Solicite uma nova prévia à Titans Studio.');

    const payload = JSON.parse(sessionData);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; HttpOnly; Secure; SameSite=Strict; Path=/api/preview-access; Max-Age=${SESSION_TTL}`);
    try { await notifyOwner(payload); }
    catch (error) { console.error('Prévia liberada, mas o aviso interno falhou:', error.message); }
    const destination = new URL('/preview.html', redirectUri).toString();
    res.setHeader('Location', destination);
    return res.status(303).end();
  } catch (error) {
    console.error('Falha no retorno OAuth do Discord:', error.message);
    return fail(res, 503, 'Não foi possível concluir o login seguro agora. Tente novamente.');
  }
};
