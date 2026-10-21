const MAX_BODY_BYTES = 2_000;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(503).json({ error: 'A entrega privada ainda precisa ser configurada.' });
  }
  const authorization = String(req.headers?.authorization || '');
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken || accessToken.length > 8_000) return res.status(401).json({ error: 'Entre na sua conta para baixar este produto.' });
  let body;
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'Solicitação muito grande.' });
    body = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Não foi possível ler a solicitação.' });
  }
  const orderCode = String(body.orderCode || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const productId = String(body.productId || '').replace(/[^a-fA-F0-9-]/g, '').slice(0, 50);
  if (!orderCode || !/^[0-9a-f-]{36}$/i.test(productId)) return res.status(400).json({ error: 'Pedido ou produto inválido.' });

  const root = supabaseUrl.replace(/\/+$/, '');
  const userResponse = await fetch(`${root}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  if (!userResponse?.ok) return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente na sua conta.' });
  const user = await userResponse.json().catch(() => ({}));
  if (!user.id) return res.status(401).json({ error: 'Não foi possível validar sua conta.' });

  // Supabase secret keys are sent as the apikey header, not as Bearer JWTs.
  const adminHeaders = { apikey: serviceKey };
  const query = new URLSearchParams({ select: 'id,status', code: `eq.${orderCode}`, user_id: `eq.${user.id}`, status: 'in.(paid,fulfilled)', limit: '1' });
  const ordersResponse = await fetch(`${root}/rest/v1/orders?${query}`, { headers: adminHeaders }).catch(() => null);
  if (!ordersResponse?.ok) return res.status(503).json({ error: 'Não foi possível consultar o pedido agora.' });
  const orders = await ordersResponse.json().catch(() => []);
  if (!orders.length) return res.status(403).json({ error: 'Este pedido não está pago ou não pertence a esta conta.' });

  const itemQuery = new URLSearchParams({ select: 'product_id', order_id: `eq.${orders[0].id}`, product_id: `eq.${productId}`, limit: '1' });
  const itemResponse = await fetch(`${root}/rest/v1/order_items?${itemQuery}`, { headers: adminHeaders }).catch(() => null);
  if (!itemResponse?.ok) return res.status(503).json({ error: 'Não foi possível validar os itens do pedido.' });
  const items = await itemResponse.json().catch(() => []);
  if (!items.length) return res.status(403).json({ error: 'Este produto não está incluído no pedido.' });

  const productQuery = new URLSearchParams({ select: 'delivery_path', id: `eq.${productId}`, limit: '1' });
  const productResponse = await fetch(`${root}/rest/v1/products?${productQuery}`, { headers: adminHeaders }).catch(() => null);
  if (!productResponse?.ok) return res.status(503).json({ error: 'Não foi possível localizar o arquivo da entrega.' });
  const products = await productResponse.json().catch(() => []);
  const path = products[0]?.delivery_path;
  if (!path || path.includes('..') || path.startsWith('/')) return res.status(404).json({ error: 'O arquivo deste produto ainda não está disponível.' });

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const signedResponse = await fetch(`${root}/storage/v1/object/sign/titans-deliveries/${encodedPath}`, {
    method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 120 }),
  }).catch(() => null);
  const signed = await signedResponse?.json().catch(() => ({}));
  const signedPath = signed?.signedURL || signed?.signedUrl;
  if (!signedResponse?.ok || !signedPath) {
    console.error('Falha ao assinar arquivo do pedido', { status: signedResponse?.status, code: signed?.statusCode });
    return res.status(503).json({ error: 'Não foi possível preparar o download agora.' });
  }
  let downloadUrl;
  if (/^https:\/\//i.test(signedPath)) downloadUrl = signedPath;
  else {
    const storagePath = signedPath.startsWith('/storage/v1/')
      ? signedPath
      : `/storage/v1${signedPath.startsWith('/') ? signedPath : `/${signedPath}`}`;
    downloadUrl = `${root}${storagePath}`;
  }
  const parsedDownload = new URL(downloadUrl);
  if (parsedDownload.origin !== new URL(root).origin) return res.status(503).json({ error: 'O armazenamento retornou um endereço inválido.' });
  parsedDownload.searchParams.set('download', path.split('/').pop().slice(0, 200));
  return res.status(200).json({ ok: true, downloadUrl: parsedDownload.toString(), expiresIn: 120 });
};
