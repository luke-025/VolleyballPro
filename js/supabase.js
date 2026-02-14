// js/supabase.js
// Thin wrapper for Supabase client + RPC helpers

(function () {
  function assertConfig() {
    const cfg = window.VP_CONFIG;
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("PASTE_")) {
      throw new Error("Brak konfiguracji Supabase. Uzupełnij js/config.js (SUPABASE_ANON_KEY).");
    }
  }

  function getClient() {
    assertConfig();
    if (!window.__vpSupabase) {
      window.__vpSupabase = window.supabase.createClient(
        window.VP_CONFIG.SUPABASE_URL,
        window.VP_CONFIG.SUPABASE_ANON_KEY,
        { auth: { persistSession: false } }
      );
    }
    return window.__vpSupabase;
  }

  async function rpc(fn, params) {
    const client = getClient();
    const { data, error } = await client.rpc(fn, params);
    if (error) throw error;
    return data;
  }

  window.VPSupabase = {
    getClient,
    rpc
  };
})();
