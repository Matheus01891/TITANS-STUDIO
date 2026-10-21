module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(200).json({ configured: false, products: [] });
  try {
    const endpoint = new URL('/rest/v1/products', url);
    endpoint.search = new URLSearchParams({
      select: 'id,slug,name,category,description,price_brl,frameworks,is_featured,is_new,image_url',
      published: 'eq.true',
      order: 'is_featured.desc,created_at.desc',
    }).toString();
    const response = await fetch(endpoint, {
      // Supabase publishable keys are API keys, not JWT bearer tokens.
      headers: { apikey: key },
    });
    if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
    const products = await response.json();
    return res.status(200).json({ configured: true, products });
  } catch (error) {
    console.error('Falha ao consultar o catálogo publicado:', error.message);
    return res.status(503).json({ error: 'Não foi possível carregar o catálogo agora.' });
  }
};
