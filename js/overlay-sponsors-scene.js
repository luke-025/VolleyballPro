// js/overlay-sponsors-scene.js
// SAFE: Sponsors-only scene renderer (does NOT touch GAME, does NOT change classes)
// Requirements: overlay.html contains element with id="sceneSponsors"
(function () {
  const UI = window.VP_UI;
  const STORE = window.VPState;

  function getSlug() { try { return UI.getSlug(); } catch { return ""; } }

  let current = null;
  let page = 0;
  let timer = null;

  function ensureStyle() {
    if (document.getElementById("vpSponsorsSceneStyle")) return;

    const css = `
      /* Sponsors scene — scoped ONLY to #sceneSponsors */
      #sceneSponsors { position:absolute; inset:0; }
      #sceneSponsors .sponsorsWrap{
        position:absolute; inset:0;
        padding: 80px;
        display:flex;
        flex-direction:column;
        gap: 22px;
      }
      #sceneSponsors .sponsorsTitle{
        display:flex; align-items:center; justify-content:flex-start;
      }
      #sceneSponsors .sponsorsTitleBadge{
        padding: 10px 16px;
        border-radius: 999px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.10);
        color: rgba(255,255,255,.92);
        font-weight: 900;
        letter-spacing: .7px;
        text-transform: uppercase;
        box-shadow: 0 18px 60px rgba(0,0,0,.55);
        backdrop-filter: blur(12px);
      }
      #sceneSponsors .sponsorsGrid{
        display:grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 18px;
        flex: 1;
        align-content:start;
      }
      #sceneSponsors .spCard{
        height: 170px;
        border-radius: 22px;
        background: rgba(10,14,28,.55);
        border: 1px solid rgba(255,255,255,.10);
        box-shadow: 0 18px 70px rgba(0,0,0,.50);
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap: 14px;
        padding: 18px;
        overflow:hidden;
        backdrop-filter: blur(14px);
      }
      #sceneSponsors .spLogo{
        width: 100%;
        height: 92px;
        display:flex; align-items:center; justify-content:center;
      }
      #sceneSponsors .spLogo img{
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 12px 30px rgba(0,0,0,.35));
      }
      #sceneSponsors .spName{
        font-size: 20px;
        font-weight: 900;
        color: rgba(255,255,255,.92);
        text-align:center;
        white-space: nowrap;
        overflow:hidden;
        text-overflow: ellipsis;
        width: 100%;
      }
      #sceneSponsors .muted{
        opacity:.7;
        font-size: 14px;
      }
    `;

    const st = document.createElement("style");
    st.id = "vpSponsorsSceneStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function ensureDOM() {
    ensureStyle();

    const scene = document.getElementById("sceneSponsors");
    if (!scene) return false;

    if (!scene.querySelector(".sponsorsWrap")) {
      const wrap = document.createElement("div");
      wrap.className = "sponsorsWrap";
      wrap.innerHTML = `
        <div class="sponsorsTitle">
          <div class="sponsorsTitleBadge">Sponsorzy</div>
        </div>
        <div class="sponsorsGrid" id="sponsorsGrid"></div>
        <div class="muted" id="sponsorsHint" style="display:none;margin-top:8px"></div>
      `;
      scene.appendChild(wrap);
    }
    return true;
  }

  function renderScene(st) {
    if (!ensureDOM()) return;

    const grid = document.getElementById("sponsorsGrid");
    const hint = document.getElementById("sponsorsHint");
    if (!grid) return;

    const sponsors = (st.sponsors || []).filter(s => s && (s.name || s.logoUrl) && s.enabled !== false);

    if (!sponsors.length) {
      grid.innerHTML = "";
      if (hint) {
        hint.style.display = "block";
        hint.textContent = "Brak sponsorów — dodaj ich w panelu Control.";
      }
      return;
    }
    if (hint) hint.style.display = "none";

    const perPage = 8;
    const pages = Math.max(1, Math.ceil(sponsors.length / perPage));
    if (page >= pages) page = 0;

    const slice = sponsors.slice(page * perPage, page * perPage + perPage);

    grid.innerHTML = "";
    slice.forEach(s => {
      const card = document.createElement("div");
      card.className = "spCard";

      const logo = document.createElement("div");
      logo.className = "spLogo";
      if (s.logoUrl) {
        const img = document.createElement("img");
        img.src = s.logoUrl;
        img.alt = s.name || "sponsor";
        logo.appendChild(img);
      }

      const name = document.createElement("div");
      name.className = "spName";
      name.textContent = s.name || "";

      card.appendChild(logo);
      card.appendChild(name);
      grid.appendChild(card);
    });

    // Fill remaining cells for consistent grid height
    for (let i = slice.length; i < perPage; i++) {
      const spacer = document.createElement("div");
      spacer.className = "spCard";
      spacer.style.opacity = "0";
      grid.appendChild(spacer);
    }

    const every = Math.min(60, Math.max(2, Number(st.meta?.sponsors?.sceneEvery || 5)));
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      const st2 = current?.state || {};
      const list = (st2.sponsors || []).filter(s => s && (s.name || s.logoUrl) && s.enabled !== false);
      const pages2 = Math.max(1, Math.ceil(list.length / perPage));
      page = (page + 1) % pages2;
      renderScene(st2);
    }, every * 1000);
  }

  function start() {
    const slug = getSlug();
    if (!slug) return;

    // Subscribe to state changes, render sponsors scene only.
    STORE.subscribeState(slug, (snap) => {
      current = snap;
      renderScene(snap.state || {});
    });

    // Also attempt once (in case subscription is slow and scene opened directly)
    STORE.fetchState(slug).then((snap) => {
      if (!current) current = snap;
      renderScene(snap.state || {});
    }).catch(() => {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
