// js/overlay-sponsors-addon.js
// Renders Sponsors scene + optional small accent on GAME.
// Safe: independent subscription, no changes to overlay.js needed.
(function () {
  const UI = window.VP_UI;
  const STORE = window.VPState;

  function getSlug() { try { return UI.getSlug(); } catch { return ""; } }

  let current = null;
  let page = 0;
  let accentIdx = 0;
  let pageTimer = null;
  let accentTimer = null;

  function ensureStyle() {
    if (document.getElementById("vpSponsorsStyle")) return;
    const css = `
      /* Sponsors scene (TV) */
      .scene-sponsors .sponsorsWrap{
        position:absolute; inset:0;
        padding: 80px 80px 80px 80px;
        display:flex;
        flex-direction:column;
        gap: 22px;
      }
      .scene-sponsors .sponsorsTitle{
        display:flex; align-items:center; justify-content:flex-start;
      }
      .scene-sponsors .sponsorsTitleBadge{
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
      .scene-sponsors .sponsorsGrid{
        display:grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 18px;
        flex: 1;
        align-content:start;
      }
      .scene-sponsors .spCard{
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
      .scene-sponsors .spLogo{
        width: 100%;
        height: 92px;
        display:flex; align-items:center; justify-content:center;
      }
      .scene-sponsors .spLogo img{
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 12px 30px rgba(0,0,0,.35));
      }
      .scene-sponsors .spName{
        font-size: 20px;
        font-weight: 900;
        color: rgba(255,255,255,.92);
        text-align:center;
        white-space: nowrap;
        overflow:hidden;
        text-overflow: ellipsis;
        width: 100%;
      }

      /* Small sponsor accent on GAME (subtle) */
      .scene-game .sponsorAccent{
        position:absolute;
        right: var(--safe-r);
        bottom: calc(86px + 22px + var(--safe-b)); /* above ticker */
        display:flex;
        align-items:center;
        gap: 10px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(10,12,16,.70);
        border: 1px solid rgba(255,255,255,.10);
        box-shadow: 0 18px 50px rgba(0,0,0,.40);
        backdrop-filter: blur(12px);
        max-width: 520px;
      }
      .scene-game .sponsorAccent .spMark{
        width: 36px;
        height: 24px;
        border-radius: 10px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.10);
        display:flex; align-items:center; justify-content:center;
        overflow:hidden;
        flex: 0 0 auto;
      }
      .scene-game .sponsorAccent .spMark img{
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        opacity: .95;
      }
      .scene-game .sponsorAccent .spText{
        display:flex;
        flex-direction:column;
        gap: 2px;
        min-width:0;
      }
      .scene-game .sponsorAccent .spLabel{
        font-size: 11px;
        letter-spacing: 2px;
        text-transform: uppercase;
        opacity: .65;
        color: #fff;
        line-height: 1;
      }
      .scene-game .sponsorAccent .spValue{
        font-size: 16px;
        font-weight: 900;
        color: rgba(255,255,255,.92);
        white-space: nowrap;
        overflow:hidden;
        text-overflow: ellipsis;
        line-height: 1.1;
      }
    `;
    const st = document.createElement("style");
    st.id = "vpSponsorsStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function ensureDOM() {
    ensureStyle();

    const sceneSponsors = document.getElementById("sceneSponsors") || document.querySelector(".scene-sponsors");
    if (sceneSponsors && !sceneSponsors.querySelector(".sponsorsWrap")) {
      const wrap = document.createElement("div");
      wrap.className = "sponsorsWrap";
      wrap.innerHTML = `
        <div class="sponsorsTitle">
          <div class="sponsorsTitleBadge">Sponsorzy</div>
        </div>
        <div class="sponsorsGrid" id="sponsorsGrid"></div>
      `;
      sceneSponsors.appendChild(wrap);
    }

    const sceneGame = document.getElementById("sceneGame") || document.querySelector(".scene-game");
    if (sceneGame && !sceneGame.querySelector(".sponsorAccent")) {
      const a = document.createElement("div");
      a.className = "sponsorAccent";
      a.style.display = "none";
      a.innerHTML = `
        <div class="spMark" id="spAccentLogo"></div>
        <div class="spText">
          <div class="spLabel">Partner transmisji</div>
          <div class="spValue" id="spAccentName"></div>
        </div>
      `;
      sceneGame.appendChild(a);
    }
  }

  function renderSponsorsScene(st) {
    ensureDOM();
    const grid = document.getElementById("sponsorsGrid");
    if (!grid) return;

    const sponsors = (st.sponsors || []).filter(s => s && (s.name || s.logoUrl) && s.enabled !== false);
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
      } else {
        logo.textContent = " ";
      }
      const name = document.createElement("div");
      name.className = "spName";
      name.textContent = s.name || "";
      card.appendChild(logo);
      card.appendChild(name);
      grid.appendChild(card);
    });

    // if fewer than perPage, keep layout nice
    for (let i = slice.length; i < perPage; i++) {
      const spacer = document.createElement("div");
      spacer.className = "spCard";
      spacer.style.opacity = "0";
      grid.appendChild(spacer);
    }

    // manage paging timer
    const every = Math.min(60, Math.max(2, Number(st.meta?.sponsors?.sceneEvery || 5)));
    if (pageTimer) clearInterval(pageTimer);
    pageTimer = setInterval(() => {
      const st2 = current?.state || {};
      const list = (st2.sponsors || []).filter(s => s && (s.name || s.logoUrl) && s.enabled !== false);
      const pages2 = Math.max(1, Math.ceil(list.length / perPage));
      page = (page + 1) % pages2;
      renderSponsorsScene(st2);
    }, every * 1000);
  }

  function renderAccent(st) {
    ensureDOM();

    const accent = document.querySelector(".scene-game .sponsorAccent");
    const nameEl = document.getElementById("spAccentName");
    const logoEl = document.getElementById("spAccentLogo");
    if (!accent || !nameEl || !logoEl) return;

    const settings = st.meta?.sponsors || {};
    const on = !!settings.accentEnabled;

    const sponsors = (st.sponsors || []).filter(s => s && (s.name || s.logoUrl) && s.enabled !== false);
    if (!on || sponsors.length === 0) {
      accent.style.display = "none";
      return;
    }

    if (accentIdx >= sponsors.length) accentIdx = 0;
    const s = sponsors[accentIdx];

    nameEl.textContent = s.name || "";
    logoEl.innerHTML = "";
    if (s.logoUrl) {
      const img = document.createElement("img");
      img.src = s.logoUrl;
      img.alt = s.name || "sponsor";
      logoEl.appendChild(img);
    }

    accent.style.display = "flex";

    const every = Math.min(60, Math.max(2, Number(settings.accentEvery || 6)));
    if (accentTimer) clearInterval(accentTimer);
    accentTimer = setInterval(() => {
      const st2 = current?.state || {};
      const list = (st2.sponsors || []).filter(s => s && (s.name || s.logoUrl) && s.enabled !== false);
      if (list.length === 0) { accent.style.display = "none"; return; }
      accentIdx = (accentIdx + 1) % list.length;
      renderAccent(st2);
    }, every * 1000);
  }

  function renderAll(st) {
    renderSponsorsScene(st);
    renderAccent(st);
  }

  function start() {
    const slug = getSlug();
    if (!slug) return;
    ensureDOM();
    STORE.subscribeState(slug, (snap) => {
      current = snap;
      renderAll(snap.state || {});
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
