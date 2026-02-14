// js/state.js
// Supabase-backed state store (single source of truth) with optimistic locking.

(function () {
  const UI = window.VP_UI;

  function getDeviceId() {
    const key = "vp_device_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  }

  function getPin(slug) {
    return sessionStorage.getItem(`vp_pin_${slug}`) || "";
  }
  function setPin(slug, pin) {
    sessionStorage.setItem(`vp_pin_${slug}`, pin);
  }

  async function getTournamentId(slug) {
    const data = await window.VPSupabase.rpc("vp_get_tournament_id", { p_slug: slug });
    return data;
  }

  async function createTournament(slug, name, pin) {
    const tid = await window.VPSupabase.rpc("vp_create_tournament", { p_slug: slug, p_name: name, p_pin: pin });
    return tid;
  }

  async function fetchState(slug) {
    const client = window.VPSupabase.getClient();
    const tid = await getTournamentId(slug);
    if (!tid) return null;
    const { data, error } = await client
      .from("vp_tournament_state")
      .select("version,state,updated_at")
      .eq("tournament_id", tid)
      .single();
    if (error) throw error;
    return { tournamentId: tid, version: data.version, state: data.state, updatedAt: data.updated_at };
  }

  function subscribeState(slug, onChange) {
    const client = window.VPSupabase.getClient();
    let channel = null;
    let active = true;

    (async () => {
      const tid = await getTournamentId(slug);
      if (!tid || !active) return;
      channel = client.channel(`vp_state_${slug}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "vp_tournament_state", filter: `tournament_id=eq.${tid}` },
          (payload) => {
            // payload.new has full row
            onChange({
              tournamentId: tid,
              version: payload.new.version,
              state: payload.new.state,
              updatedAt: payload.new.updated_at
            });
          })
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) client.removeChannel(channel);
    };
  }

  async function updateState(slug, pin, expectedVersion, newState) {
    const res = await window.VPSupabase.rpc("vp_update_state", {
      p_slug: slug,
      p_pin: pin,
      p_expected_version: expectedVersion,
      p_new_state: newState
    });
    // returns array of rows in PostgREST style
    const row = Array.isArray(res) ? res[0] : res;
    return row;
  }

  async function changePin(slug, oldPin, newPin) {
    const res = await window.VPSupabase.rpc("vp_change_pin", {
      p_slug: slug, p_old_pin: oldPin, p_new_pin: newPin
    });
    return res;
  }

  // Apply a mutation with conflict retry once.
  async function mutate(slug, pin, mutator, { maxRetries = 1 } = {}) {
    let attempt = 0;
    while (true) {
      const snapshot = await fetchState(slug);
      if (!snapshot) throw new Error("Tournament not found");
      const nextState = mutator(structuredClone(snapshot.state));
      try {
        const row = await updateState(slug, pin, snapshot.version, nextState);
        return { ...snapshot, version: row.new_version ?? row.version ?? (snapshot.version + 1), state: nextState };
      } catch (e) {
        const msg = (e?.message || "").toLowerCase();
        if (attempt < maxRetries && msg.includes("version conflict")) {
          attempt++;
          continue;
        }
        throw e;
      }
    }
  }

  window.VPState = {
    getDeviceId,
    getPin, setPin,
    getTournamentId,
    createTournament,
    fetchState,
    subscribeState,
    mutate,
    changePin
  };
})();
