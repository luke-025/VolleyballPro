// js/control-scene.js
// Adds Scene Transmisji buttons to existing Control without touching your main control.js.
// Requires: VPState (js/state.js) and VP_UI (js/ui-shared.js).

(function () {
  const UI = window.VP_UI;
  const STORE = window.VPState;

  if (!UI || !STORE) {
    console.warn("[control-scene] Missing VP_UI or VPState");
    return;
  }

  const slug = UI.getSlug();
  const btns = {
    game: document.getElementById("btnSceneGame"),
    break: document.getElementById("btnSceneBreak"),
    technical: document.getElementById("btnSceneTechnical"),
    sponsors: document.getElementById("btnSceneSponsors"),
  };
  const badge = document.getElementById("sceneStatus");

  function setBadge(scene) {
    if (badge) badge.textContent = "Scena: " + String(scene || "—").toUpperCase();
  }

  async function setScene(scene) {
    if (!slug) return;
    const pin = STORE.getPin(slug);
    if (!pin) {
      alert("Najpierw kliknij: „Zapisz PIN na tę sesję” (PIN jest potrzebny do zmiany sceny).");
      return;
    }
    try {
      await STORE.mutate(slug, pin, (st) => {
        st.meta = st.meta || {};
        st.meta.scene = scene;
        return st;
      });
    } catch (e) {
      console.error(e);
      alert("Nie udało się zmienić sceny. Sprawdź PIN lub konsolę (F12).");
    }
  }

  // Wire buttons
  if (btns.game) btns.game.addEventListener("click", () => setScene("game"));
  if (btns.break) btns.break.addEventListener("click", () => setScene("break"));
  if (btns.technical) btns.technical.addEventListener("click", () => setScene("technical"));
  if (btns.sponsors) btns.sponsors.addEventListener("click", () => setScene("sponsors"));

  // Live update badge via realtime
  if (slug) {
    STORE.fetchState(slug).then((snap) => {
      if (snap && snap.state) setBadge(snap.state.meta?.scene || "game");
    }).catch(() => {});
    STORE.subscribeState(slug, (snap) => {
      setBadge(snap.state?.meta?.scene || "game");
    });
  } else {
    setBadge("—");
  }
})();
