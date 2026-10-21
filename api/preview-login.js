const crypto = require('node:crypto');

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

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Método não permitido.');
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) return fail(res, 503, 'O login seguro do Discord ainda não foi configurado pela Titans Studio.');

  try {
    const code = query(req, 'code');
    if (!/^[A-Za-z0-9_-]{30,80}$/.test(code)) return fail(res, 400, 'O link individual está incompleto ou inválido. Abra novamente o link recebido por DM.');
    const stored = await redisCommand(['GET', `ts:preview:code:${code}`]);
    if (!stored) return fail(res, 410, 'Este link já foi usado ou expirou. Solicite uma nova prévia à Titans Studio.');
    const payload = JSON.parse(stored);
    if (payload.channel !== 'discord' || !/^\d{17,20}$/.test(payload.contact || '')) {
      return fail(res, 403, 'Este link não está associado a uma solicitação válida do Discord.');
    }

    const state = crypto.randomBytes(32).toString('base64url');
    const saved = await redisCommand(['SET', `ts:preview:oauth-state:${state}`, code, 'EX', 10 * 60, 'NX']);
    if (saved !== 'OK') return fail(res, 503, 'Não foi possível iniciar o login seguro. Abra o link novamente.');

    const authorization = new URL('https://discord.com/oauth2/authorize');
    authorization.searchParams.set('client_id', clientId);
    authorization.searchParams.set('response_type', 'code');
    authorization.searchParams.set('redirect_uri', redirectUri);
    authorization.searchParams.set('scope', 'identify');
    authorization.searchParams.set('state', state);
    authorization.searchParams.set('prompt', 'consent');
    res.setHeader('Location', authorization.toString());
    return res.status(302).end();
  } catch (error) {
    console.error('Falha ao iniciar OAuth do Discord:', error.message);
    return fail(res, 503, 'Não foi possível iniciar o login seguro agora. Tente novamente mais tarde.');
  }
};
