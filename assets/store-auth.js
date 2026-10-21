(function () {
  let client = null;
  const ready = (async function () {
    try {
      const response = await fetch('/api/public-config', { cache: 'no-store' });
      const config = await response.json();
      if (!response.ok || !config.configured || !window.supabase?.createClient) return { configured: false };
      client = window.supabase.createClient(config.url, config.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      return { configured: true, client };
    } catch (_) {
      return { configured: false };
    }
  })();
  window.TitansAuth = { ready, get client() { return client; } };
})();
