const COOKIE_NAME = 'titans_preview';

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('A proteção da prévia não está configurada.');
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

function getCookie(req, name) {
  const header = req.headers?.cookie || '';
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const sessionId = getCookie(req, COOKIE_NAME);
    if (!/^[A-Za-z0-9_-]{30,80}$/.test(sessionId)) return res.status(401).json({ error: 'Acesso não autorizado.' });
    const data = await redisCommand(['GET', `ts:preview:session:${sessionId}`]);
    if (!data) return res.status(401).json({ error: 'A sessão expirou. Peça uma nova prévia à Titans Studio.' });
    return res.status(200).json({ ok: true, ...JSON.parse(data) });
  } catch (error) {
    console.error('Falha ao validar acesso à prévia:', error.message);
    return res.status(503).json({ error: 'Não foi possível validar a prévia agora. Tente novamente mais tarde.' });
  }
};
