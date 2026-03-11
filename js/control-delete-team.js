// js/control-delete-team.js
// Adds working "Usuń" action for teams without touching existing control.js
(function () {
  const UI = window.VP_UI;
  const STORE = window.VPState;

  function bind() {
    const root = document.getElementById("teamsList");
    if (!root) return;

    root.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-del-team]");
      if (!btn) return;

      ev.preventDefault();
      ev.stopPropagation();

      const slug = UI.getSlug();
      if (!slug) return UI.toast("Brak slug turnieju.", "warn");

      const teamId = btn.getAttribute("data-del-team");
      const teamName = (btn.closest(".row")?.querySelector("b")?.textContent || "").trim() || "drużynę";

      if (!await UI.confirmDialog(`Usunąć "${teamName}"?`, "Uwaga: usunięte zostaną też mecze z jej udziałem.")) return;

      const pin = STORE.getPin(slug);
      if (!pin) return UI.toast("Podaj PIN w Control (pole PIN), żeby usuwać.", "warn");

      btn.disabled = true;

      try {
        await STORE.mutate(slug, pin, (st) => {
          st.teams = (st.teams || []).filter(t => t.id !== teamId);

          const removedMatchIds = new Set();
          st.matches = (st.matches || []).filter(m => {
            const hit = m.teamAId === teamId || m.teamBId === teamId;
            if (hit) removedMatchIds.add(m.id);
            return !hit;
          });

          // Clear meta pointers if needed
          if (st.meta) {
            if (st.meta.programMatchId && removedMatchIds.has(st.meta.programMatchId)) st.meta.programMatchId = null;
            if (st.meta.liveMatchId && removedMatchIds.has(st.meta.liveMatchId)) st.meta.liveMatchId = null;

            // Remove from queue
            if (Array.isArray(st.meta.queue)) {
              st.meta.queue = st.meta.queue.filter(q => !removedMatchIds.has(q?.matchId));
            }
          }

          // Force playoffs re-gen if present
          if (st.playoffs) st.playoffs.generated = false;

          return st;
        });

        UI.toast(`Usunięto: ${teamName}`, "success");
      } catch (e) {
        UI.toast(UI.fmtError(e), "error");
      } finally {
        btn.disabled = false;
      }
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
