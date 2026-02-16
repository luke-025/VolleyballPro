// js/overlay-sponsors-rotator.js
// SAFE: Sponsors scene only. Shows ONE sponsor at a time and rotates.
// Does NOT touch GAME, does NOT change classes.
// Needs: <div id="sceneSponsors" class="scene"></div> in overlay.html
(function () {
  const UI = window.VP_UI;
  const STORE = window.VPState;

  const STYLE_ID = "vpSponsorsRotatorStyleV2";

  function getSlug() { try { return UI.getSlug(); } catch { return ""; } }

  let snap = null;
  let idx = 0;
  let intervalId = null;
  let animLock = false;
  let pendingTimeout = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const css = `
      /* Scope EVERYTHING to #sceneSponsors so we never affect other scenes */
      #sceneSponsors{
        position:absolute; inset:0;
        background: transparent !important;
        overflow:hidden;
        pointer-events:none;
      }

      /* Cinematic, darker wash (no flat white) */
      #sceneSponsors .spBackdrop{
        position:absolute; inset:-80px;
        background:
          radial-gradient(1200px 760px at 22% 26%, rgba(120,210,255,.20), rgba(0,0,0,0) 60%),
          radial-gradient(1150px 720px at 78% 30%, rgba(185,120,255,.18), rgba(0,0,0,0) 62%),
          radial-gradient(1400px 900px at 50% 85%, rgba(90,255,200,.12), rgba(0,0,0,0) 60%),
          linear-gradient(180deg, rgba(6,8,12,.72), rgba(6,8,12,.52));
        opacity: .98;
        transform: scale(1.02);
        filter: saturate(1.05) contrast(1.05);
      }

      /* subtle vignette for TV */
      #sceneSponsors .spVignette{
        position:absolute; inset:0;
        background: radial-gradient(1200px 700px at 50% 45%, rgba(0,0,0,0), rgba(0,0,0,.55));
        opacity: .55;
        pointer-events:none;
      }

      #sceneSponsors .spStage{
        position:absolute; inset:0;
        display:flex;
        align-items:center;
        justify-content:center;
        padding: clamp(26px, 4vw, 72px);
      }

      /* Card */
      #sceneSponsors .spCard{
        position:relative;
        width: min(1180px, 88vw);
        height: min(560px, 66vh);
        border-radius: 30px;
        background: rgba(12,16,28,.34);
        border: 1px solid rgba(255,255,255,.12);
        box-shadow:
          0 40px 160px rgba(0,0,0,.62),
          inset 0 1px 0 rgba(255,255,255,.10);
        backdrop-filter: blur(18px);
        display:flex;
        align-items:center;
        justify-content:center;
        padding: clamp(22px, 3.2vw, 46px);
        overflow:hidden;

        /* animation base */
        opacity: 0;
        transform: translateY(14px) scale(.985);
        filter: blur(8px);
      }

      #sceneSponsors .spCard.isVisible{
        opacity: 1;
        transform: translateY(0px) scale(1);
        filter: blur(0px);
        transition:
          opacity 520ms cubic-bezier(.2,.9,.2,1),
          transform 520ms cubic-bezier(.2,.9,.2,1),
          filter 520ms cubic-bezier(.2,.9,.2,1);
      }

      #sceneSponsors .spCard.isLeaving{
        opacity: 0;
        transform: translateY(-10px) scale(1.01);
        filter: blur(10px);
        transition:
          opacity 380ms ease,
          transform 380ms ease,
          filter 380ms ease;
      }

      /* Soft highlight streak */
      #sceneSponsors .spCard::before{
        content:"";
        position:absolute; inset:-2px;
        background: radial-gradient(700px 360px at 40% 22%, rgba(255,255,255,.16), rgba(0,0,0,0) 60%);
        opacity:.35;
        pointer-events:none;
      }

      #sceneSponsors .spInner{
        width:100%;
        height:100%;
        display:flex;
        align-items:center;
        justify-content:center;
        gap: clamp(14px, 2.2vw, 28px);
        flex-direction:column;
        text-align:center;
      }

      #sceneSponsors .spLogo{
        width:100%;
        height:72%;
        display:flex;
        align-items:center;
        justify-content:center;
      }

      #sceneSponsors .spLogo img{
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 22px 74px rgba(0,0,0,.52));
      }

      #sceneSponsors .spName{
        font-weight: 950;
        letter-spacing: .5px;
        color: rgba(255,255,255,.96);
        font-size: clamp(22px, 2.5vw, 38px);
        line-height: 1.08;
        max-width: 92%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #sceneSponsors .spDesc{
        margin-top: -6px;
        color: rgba(255,255,255,.72);
        font-size: clamp(15px, 1.6vw, 21px);
        font-weight: 650;
        letter-spacing: .15px;
        max-width: 92%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* When sponsor has NO logo, make it look intentional */
      #sceneSponsors .spNoLogo{
        height:72%;
        width:100%;
        display:flex;
        align-items:center;
        justify-content:center;
        border-radius: 22px;
        background: rgba(255,255,255,.06);
        border: 1px dashed rgba(255,255,255,.18);
        color: rgba(255,255,255,.72);
        font-weight: 900;
        letter-spacing: 2px;
        text-transform: uppercase;
      }
    `;

    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  function ensureDOM() {
    ensureStyle();
    const host = document.getElementById("sceneSponsors");
    if (!host) return null;

    if (!host.querySelector(".spStage")) {
      host.innerHTML = "";
      const backdrop = document.createElement("div");
      backdrop.className = "spBackdrop";

      const vignette = document.createElement("div");
      vignette.className = "spVignette";

      const stage = document.createElement("div");
      stage.className = "spStage";
      stage.innerHTML = `
        <div class="spCard" id="spCard">
          <div class="spInner">
            <div class="spLogo" id="spLogo"></div>
            <div class="spName" id="spName"></div>
            <div class="spDesc" id="spDesc"></div>
          </div>
        </div>
      `;

      host.appendChild(backdrop);
      host.appendChild(vignette);
      host.appendChild(stage);
    }
    return host;
  }

  function normalizeSponsors(state) {
    return (state.sponsors || [])
      .filter(s => s && (s.logoUrl || s.name) && s.enabled !== false)
      .map(s => ({
        name: String(s.name || "").trim(),
        desc: String(s.desc || s.description || s.tagline || "").trim(),
        logoUrl: String(s.logoUrl || s.logo || "").trim(),
      }));
  }

  function setContent(sponsor) {
    ensureDOM();
    const logo = document.getElementById("spLogo");
    const name = document.getElementById("spName");
    const desc = document.getElementById("spDesc");
    if (!logo || !name || !desc) return;

    logo.innerHTML = "";
    name.textContent = sponsor?.name || "";
    desc.textContent = sponsor?.desc || "";
    desc.style.display = sponsor?.desc ? "block" : "none";

    if (sponsor?.logoUrl) {
      const img = document.createElement("img");
      img.src = sponsor.logoUrl;
      img.alt = sponsor.name || "sponsor";
      logo.appendChild(img);
    } else {
      const box = document.createElement("div");
      box.className = "spNoLogo";
      box.textContent = "LOGO";
      logo.appendChild(box);
    }
  }

  function transitionTo(sponsor) {
    ensureDOM();
    const card = document.getElementById("spCard");
    if (!card) return;

    // cancel previous pending
    if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
    if (animLock) return;

    animLock = true;

    // If first time, just show
    if (!card.classList.contains("isVisible")) {
      setContent(sponsor);
      requestAnimationFrame(() => card.classList.add("isVisible"));
      animLock = false;
      return;
    }

    // Leave
    card.classList.add("isLeaving");
    // After leave animation, swap content and enter
    pendingTimeout = setTimeout(() => {
      setContent(sponsor);
      card.classList.remove("isLeaving");
      // force reflow for clean enter
      void card.offsetHeight;
      card.classList.add("isVisible");
      animLock = false;
    }, 390);
  }

  function rotate(state) {
    const sponsors = normalizeSponsors(state);

    if (!sponsors.length) {
      transitionTo({ name: "Brak sponsorów", desc: "Dodaj sponsorów w panelu Control.", logoUrl: "" });
      return;
    }
    if (idx >= sponsors.length) idx = 0;

    transitionTo(sponsors[idx]);
    idx = (idx + 1) % sponsors.length;
  }

  function schedule(state) {
    const every = Math.min(120, Math.max(2, Number(state.meta?.sponsors?.sceneEvery || 6)));
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => rotate(snap?.state || {}), every * 1000);
  }

  function start() {
    const slug = getSlug();
    if (!slug) return;

    ensureDOM();

    STORE.subscribeState(slug, (s) => {
      snap = s;
      rotate(s.state || {});
      schedule(s.state || {});
    });

    STORE.fetchState(slug).then((s) => {
      if (!snap) snap = s;
      rotate(s.state || {});
      schedule(s.state || {});
    }).catch(() => {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
