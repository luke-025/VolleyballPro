// js/overlay-sponsors-rotator.tv.wipe.js
// SAFE: Sponsors scene only. ONE sponsor at a time, full-screen TV look.
// Adds "wipe" transition (like TV) without touching other scenes.
// Also: removes bottom-left capsule, and renders logos on a white plate.
// Needs: <div id="sceneSponsors" class="scene"></div> in overlay.html
(function () {
  const UI = window.VP_UI;
  const STORE = window.VPState;

  const STYLE_ID = "vpSponsorsRotatorTVWipeStyle";

  function getSlug() { try { return UI.getSlug(); } catch { return ""; } }

  let snap = null;
  let idx = 0;
  let intervalId = null;
  let pendingTimeout = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const css = `
      /* Scope EVERYTHING to #sceneSponsors so we never affect other scenes */
      #sceneSponsors{
        position:absolute; inset:0;
        background: #070A12 !important;
        overflow:hidden;
        pointer-events:none;
      }

      /* Cinematic TV backdrop */
      #sceneSponsors .spTVBg{
        position:absolute; inset:-90px;
        background:
          radial-gradient(1400px 900px at 22% 28%, rgba(120,210,255,.20), rgba(0,0,0,0) 60%),
          radial-gradient(1300px 820px at 78% 30%, rgba(185,120,255,.18), rgba(0,0,0,0) 62%),
          radial-gradient(1500px 980px at 50% 88%, rgba(90,255,200,.12), rgba(0,0,0,0) 60%),
          linear-gradient(180deg, rgba(5,7,11,.80), rgba(5,7,11,.62));
        opacity: .98;
        filter: saturate(1.06) contrast(1.08);
        transform: scale(1.02);
      }
      #sceneSponsors .spVignette{
        position:absolute; inset:0;
        background:
          radial-gradient(1200px 760px at 50% 44%, rgba(0,0,0,0), rgba(0,0,0,.60)),
          linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.05));
        opacity: .72;
      }
      #sceneSponsors .spNoise{
        position:absolute; inset:0;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.16'/%3E%3C/svg%3E");
        mix-blend-mode: overlay;
        opacity: .14;
        pointer-events:none;
      }

      /* Stage */
      #sceneSponsors .spStage{
        position:absolute; inset:0;
        display:flex;
        align-items:center;
        justify-content:center;
        padding: clamp(26px, 4vw, 86px);
      }

      /* Wipe overlay (diagonal bar + light streak) */
      #sceneSponsors .spWipe{
        position:absolute;
        top:-30%;
        left:-70%;
        width: 240%;
        height: 160%;
        background:
          linear-gradient(110deg,
            rgba(255,255,255,0) 34%,
            rgba(255,255,255,.12) 44%,
            rgba(255,255,255,.22) 50%,
            rgba(255,255,255,.12) 56%,
            rgba(255,255,255,0) 66%);
        filter: blur(0px);
        opacity: 0;
        transform: translateX(-18%) skewX(-10deg);
        mix-blend-mode: screen;
        pointer-events:none;
      }
      #sceneSponsors .spWipe.isRun{
        opacity: .95;
        animation: spWipeMove 620ms cubic-bezier(.2,.9,.2,1) both;
      }
      @keyframes spWipeMove{
        0%   { transform: translateX(-22%) skewX(-10deg); opacity: 0; }
        15%  { opacity: .95; }
        100% { transform: translateX(16%) skewX(-10deg); opacity: 0; }
      }

      /* Content block */
      #sceneSponsors .spHero{
        width: min(1480px, 94vw);
        height: min(840px, 78vh);
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap: clamp(18px, 2.6vw, 34px);
        text-align:center;

        opacity: 0;
        transform: translateY(16px) scale(.99);
        filter: blur(10px);
      }
      #sceneSponsors .spHero.isIn{
        opacity: 1;
        transform: translateY(0px) scale(1);
        filter: blur(0px);
        transition:
          opacity 520ms cubic-bezier(.18,.9,.18,1),
          transform 520ms cubic-bezier(.18,.9,.18,1),
          filter 520ms cubic-bezier(.18,.9,.18,1);
      }
      #sceneSponsors .spHero.isOut{
        opacity: 0;
        transform: translateY(-10px) scale(1.01);
        filter: blur(12px);
        transition:
          opacity 380ms ease,
          transform 380ms ease,
          filter 380ms ease;
      }

      /* Big logo area with WHITE plate */
      #sceneSponsors .spLogo{
        width: 100%;
        height: 62%;
        display:flex;
        align-items:center;
        justify-content:center;
      }
      #sceneSponsors .spPlate{
        width: min(1180px, 86vw);
        height: min(430px, 48vh);
        border-radius: 28px;
        background: rgba(255,255,255,.94);
        box-shadow:
          0 36px 140px rgba(0,0,0,.55),
          inset 0 1px 0 rgba(0,0,0,.06);
        display:flex;
        align-items:center;
        justify-content:center;
        padding: clamp(18px, 2.5vw, 44px);
      }
      #sceneSponsors .spPlate img{
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 16px 44px rgba(0,0,0,.28));
      }

      /* Name + role (VISIBLE, TV-sized) */
      #sceneSponsors .spName{
        font-weight: 980;
        letter-spacing: .6px;
        color: rgba(255,255,255,.96);
        font-size: clamp(28px, 3.2vw, 56px);
        line-height: 1.04;
        max-width: 96%;
        text-shadow: 0 10px 40px rgba(0,0,0,.55);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #sceneSponsors .spDesc{
        margin-top: -10px;
        color: rgba(255,255,255,.84);
        font-weight: 850;
        letter-spacing: .25px;
        font-size: clamp(22px, 2.2vw, 38px);
        line-height: 1.1;
        max-width: 96%;
        text-shadow: 0 10px 40px rgba(0,0,0,.45);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Fallback "no logo" */
      #sceneSponsors .spNoLogo{
        width: min(1180px, 86vw);
        height: min(430px, 48vh);
        border-radius: 28px;
        background: rgba(255,255,255,.10);
        border: 1px dashed rgba(255,255,255,.22);
        display:flex;
        align-items:center;
        justify-content:center;
        color: rgba(255,255,255,.78);
        font-weight: 900;
        letter-spacing: 3px;
        text-transform: uppercase;
        font-size: clamp(22px, 2.2vw, 34px);
        box-shadow: 0 36px 140px rgba(0,0,0,.50);
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
      host.insertAdjacentHTML("beforeend", `
        <div class="spTVBg"></div>
        <div class="spVignette"></div>
        <div class="spNoise"></div>
        <div class="spStage">
          <div class="spHero" id="spHero">
            <div class="spLogo" id="spLogo"></div>
            <div class="spName" id="spName"></div>
            <div class="spDesc" id="spDesc"></div>
          </div>
        </div>
        <div class="spWipe" id="spWipe"></div>
      `);
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
      const plate = document.createElement("div");
      plate.className = "spPlate";
      const img = document.createElement("img");
      img.src = sponsor.logoUrl;
      img.alt = sponsor.name || "sponsor";
      plate.appendChild(img);
      logo.appendChild(plate);
    } else {
      const box = document.createElement("div");
      box.className = "spNoLogo";
      box.textContent = "LOGO";
      logo.appendChild(box);
    }
  }

  function runWipe() {
    const wipe = document.getElementById("spWipe");
    if (!wipe) return;
    wipe.classList.remove("isRun");
    // force reflow
    void wipe.offsetHeight;
    wipe.classList.add("isRun");
  }

  function transitionTo(sponsor) {
    ensureDOM();
    const hero = document.getElementById("spHero");
    if (!hero) return;

    if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }

    // First show
    if (!hero.classList.contains("isIn")) {
      setContent(sponsor);
      runWipe();
      requestAnimationFrame(() => hero.classList.add("isIn"));
      return;
    }

    // Start wipe + fade out quickly
    runWipe();
    hero.classList.add("isOut");

    // Swap content mid-wipe, then fade in
    pendingTimeout = setTimeout(() => {
      setContent(sponsor);
      hero.classList.remove("isOut");
      void hero.offsetHeight;
      hero.classList.add("isIn");
    }, 320);
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
