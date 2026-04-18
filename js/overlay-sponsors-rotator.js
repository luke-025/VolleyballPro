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

      /* === Animated cinematic mesh === */
      #sceneSponsors .spTVBg{
        position:absolute; inset:-120px;
        background:
          radial-gradient(1500px 1000px at 18% 22%, rgba(120,210,255,.28), rgba(0,0,0,0) 58%),
          radial-gradient(1300px 820px at 82% 30%, rgba(185,120,255,.24), rgba(0,0,0,0) 60%),
          radial-gradient(1500px 980px at 50% 92%, rgba(90,255,200,.16), rgba(0,0,0,0) 60%),
          linear-gradient(180deg, rgba(5,7,11,.80), rgba(5,7,11,.62));
        opacity: .98;
        filter: saturate(1.1) contrast(1.08);
        animation: spMeshDrift 28s ease-in-out infinite alternate;
      }
      @keyframes spMeshDrift{
        0%   { transform: scale(1.02) translate(0, 0); }
        50%  { transform: scale(1.05) translate(-1.2%, .8%); }
        100% { transform: scale(1.02) translate(1%, -.6%); }
      }

      /* Floating orbs for subtle motion */
      #sceneSponsors .spOrbs{
        position:absolute; inset:0;
        pointer-events:none;
        overflow:hidden;
      }
      #sceneSponsors .spOrbs::before,
      #sceneSponsors .spOrbs::after{
        content:"";
        position:absolute;
        width: 60vw; height: 60vw;
        max-width: 900px; max-height: 900px;
        border-radius: 50%;
        filter: blur(90px);
        opacity: .45;
      }
      #sceneSponsors .spOrbs::before{
        left:-18vw; top:-20vw;
        background: radial-gradient(circle, rgba(106,228,255,.55), transparent 60%);
        animation: spOrbA 22s ease-in-out infinite alternate;
      }
      #sceneSponsors .spOrbs::after{
        right:-16vw; bottom:-22vw;
        background: radial-gradient(circle, rgba(165,110,255,.55), transparent 60%);
        animation: spOrbB 26s ease-in-out infinite alternate;
      }
      @keyframes spOrbA{
        0%   { transform: translate(0, 0) scale(1); }
        100% { transform: translate(8vw, 6vw) scale(1.12); }
      }
      @keyframes spOrbB{
        0%   { transform: translate(0, 0) scale(1); }
        100% { transform: translate(-7vw, -5vw) scale(1.10); }
      }

      #sceneSponsors .spVignette{
        position:absolute; inset:0;
        background:
          radial-gradient(1300px 820px at 50% 48%, rgba(0,0,0,0), rgba(0,0,0,.58)),
          linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.05));
        opacity: .72;
      }
      #sceneSponsors .spNoise{
        position:absolute; inset:0;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.16'/%3E%3C/svg%3E");
        mix-blend-mode: overlay;
        opacity: .12;
        pointer-events:none;
      }

      /* === Corner decorations (broadcast brackets) === */
      #sceneSponsors .spCorner{
        position:absolute;
        width: clamp(32px, 3.2vw, 56px);
        height: clamp(32px, 3.2vw, 56px);
        border-color: rgba(106,228,255,.55);
        opacity: .9;
      }
      #sceneSponsors .spCorner.tl{
        top: clamp(28px, 3.2vw, 60px); left: clamp(28px, 3.2vw, 60px);
        border-top: 2px solid; border-left: 2px solid;
        border-top-left-radius: 6px;
      }
      #sceneSponsors .spCorner.tr{
        top: clamp(28px, 3.2vw, 60px); right: clamp(28px, 3.2vw, 60px);
        border-top: 2px solid; border-right: 2px solid;
        border-top-right-radius: 6px;
        border-color: rgba(165,110,255,.55);
      }
      #sceneSponsors .spCorner.bl{
        bottom: clamp(28px, 3.2vw, 60px); left: clamp(28px, 3.2vw, 60px);
        border-bottom: 2px solid; border-left: 2px solid;
        border-bottom-left-radius: 6px;
        border-color: rgba(165,110,255,.55);
      }
      #sceneSponsors .spCorner.br{
        bottom: clamp(28px, 3.2vw, 60px); right: clamp(28px, 3.2vw, 60px);
        border-bottom: 2px solid; border-right: 2px solid;
        border-bottom-right-radius: 6px;
      }

      /* === Header badge === */
      #sceneSponsors .spBadge{
        position:absolute;
        top: clamp(44px, 5vw, 84px);
        left: 50%;
        transform: translateX(-50%);
        display:inline-flex;
        align-items:center;
        gap: 14px;
        padding: 10px 22px;
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(106,228,255,.16), rgba(165,110,255,.16));
        border: 1px solid rgba(255,255,255,.16);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 10px 40px rgba(0,0,0,.35);
        z-index: 3;
      }
      #sceneSponsors .spBadge .dot{
        width: 10px; height: 10px; border-radius: 50%;
        background: #6ae4ff;
        box-shadow: 0 0 14px #6ae4ff;
        animation: spPulse 1.8s ease-in-out infinite;
      }
      @keyframes spPulse{
        0%, 100%{ opacity: 1; transform: scale(1); }
        50%     { opacity: .6; transform: scale(.85); }
      }
      #sceneSponsors .spBadge .lbl{
        font-weight: 800;
        font-size: clamp(13px, 1.15vw, 18px);
        letter-spacing: 3.5px;
        text-transform: uppercase;
        color: rgba(255,255,255,.92);
      }

      /* === Tournament name at bottom === */
      #sceneSponsors .spTournamentBar{
        position:absolute;
        bottom: clamp(50px, 5.4vw, 90px);
        left: 50%;
        transform: translateX(-50%);
        display:flex;
        align-items:center;
        gap: 24px;
        z-index: 3;
      }
      #sceneSponsors .spTournamentName{
        font-weight: 800;
        font-size: clamp(14px, 1.3vw, 22px);
        letter-spacing: 4px;
        text-transform: uppercase;
        color: rgba(106,228,255,.92);
        text-shadow: 0 6px 24px rgba(0,0,0,.55);
        max-width: 60vw;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #sceneSponsors .spDots{
        display:flex;
        gap: 8px;
      }
      #sceneSponsors .spDots span{
        width: 8px; height: 8px; border-radius: 50%;
        background: rgba(255,255,255,.2);
        transition: background .35s ease, transform .35s ease;
      }
      #sceneSponsors .spDots span.active{
        background: #6ae4ff;
        box-shadow: 0 0 10px rgba(106,228,255,.7);
        transform: scale(1.25);
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
            rgba(106,228,255,.14) 44%,
            rgba(255,255,255,.26) 50%,
            rgba(165,110,255,.14) 56%,
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
        height: min(760px, 70vh);
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap: clamp(20px, 2.6vw, 36px);
        text-align:center;

        opacity: 0;
        transform: translateY(18px) scale(.99);
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

      /* Big logo area with framed plate */
      #sceneSponsors .spLogo{
        width: 100%;
        height: 62%;
        display:flex;
        align-items:center;
        justify-content:center;
        position:relative;
      }

      /* Glowing frame container */
      #sceneSponsors .spFrame{
        position:relative;
        padding: 3px;
        border-radius: 30px;
        background: linear-gradient(135deg,
          rgba(106,228,255,.55),
          rgba(165,110,255,.55) 45%,
          rgba(45,255,158,.45));
        box-shadow:
          0 40px 140px rgba(0,0,0,.60),
          0 0 80px rgba(106,228,255,.22),
          0 0 120px rgba(165,110,255,.18);
        animation: spFrameGlow 8s ease-in-out infinite alternate;
      }
      @keyframes spFrameGlow{
        0%  { filter: hue-rotate(0deg) brightness(1); }
        100%{ filter: hue-rotate(20deg) brightness(1.08); }
      }
      #sceneSponsors .spPlate{
        width: min(1140px, 82vw);
        height: min(420px, 46vh);
        border-radius: 27px;
        background:
          radial-gradient(ellipse at 50% 0%, rgba(255,255,255,1), rgba(248,250,255,.94) 80%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
        display:flex;
        align-items:center;
        justify-content:center;
        padding: clamp(20px, 2.8vw, 48px);
        position:relative;
      }
      #sceneSponsors .spPlate::before{
        content:"";
        position:absolute;
        top: 10px; left: 10px; right: 10px;
        height: 40%;
        border-radius: 20px 20px 60% 60% / 20px 20px 100% 100%;
        background: linear-gradient(180deg, rgba(255,255,255,.55), transparent);
        pointer-events:none;
      }
      #sceneSponsors .spPlate img{
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        position:relative; z-index:1;
        filter: drop-shadow(0 18px 46px rgba(0,0,0,.30));
      }

      /* Name + role (VISIBLE, TV-sized) */
      #sceneSponsors .spName{
        font-weight: 980;
        letter-spacing: .6px;
        color: rgba(255,255,255,.96);
        font-size: clamp(32px, 3.4vw, 60px);
        line-height: 1.04;
        max-width: 96%;
        text-shadow: 0 10px 40px rgba(0,0,0,.55), 0 0 40px rgba(106,228,255,.12);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #sceneSponsors .spDesc{
        margin-top: -10px;
        color: rgba(255,255,255,.80);
        font-weight: 700;
        letter-spacing: 1.5px;
        font-size: clamp(18px, 1.8vw, 32px);
        line-height: 1.15;
        max-width: 90%;
        text-shadow: 0 10px 40px rgba(0,0,0,.45);
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Fallback "no logo" */
      #sceneSponsors .spNoLogo{
        width: min(1140px, 82vw);
        height: min(420px, 46vh);
        border-radius: 27px;
        background: rgba(255,255,255,.06);
        border: 1px dashed rgba(255,255,255,.22);
        display:flex;
        align-items:center;
        justify-content:center;
        color: rgba(255,255,255,.70);
        font-weight: 900;
        letter-spacing: 4px;
        text-transform: uppercase;
        font-size: clamp(22px, 2.2vw, 34px);
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
        <div class="spOrbs"></div>
        <div class="spVignette"></div>
        <div class="spNoise"></div>
        <div class="spCorner tl"></div>
        <div class="spCorner tr"></div>
        <div class="spCorner bl"></div>
        <div class="spCorner br"></div>
        <div class="spBadge">
          <span class="dot"></span>
          <span class="lbl">Partnerzy turnieju</span>
        </div>
        <div class="spStage">
          <div class="spHero" id="spHero">
            <div class="spLogo" id="spLogo"></div>
            <div class="spName" id="spName"></div>
            <div class="spDesc" id="spDesc"></div>
          </div>
        </div>
        <div class="spTournamentBar">
          <div class="spTournamentName" id="spTournamentName"></div>
          <div class="spDots" id="spDots"></div>
        </div>
        <div class="spWipe" id="spWipe"></div>
      `);
    }
    return host;
  }

  function updateDots(total, activeIdx) {
    const el = document.getElementById("spDots");
    if (!el) return;
    if (total <= 1) { el.innerHTML = ""; return; }
    const capped = Math.min(total, 12);
    const parts = [];
    for (let i = 0; i < capped; i++) {
      parts.push(`<span class="${i === activeIdx ? "active" : ""}"></span>`);
    }
    el.innerHTML = parts.join("");
  }

  function updateTournamentName(state) {
    const el = document.getElementById("spTournamentName");
    if (!el) return;
    const name = state?.meta?.name || getSlug() || "";
    el.textContent = String(name || "");
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
      const frame = document.createElement("div");
      frame.className = "spFrame";
      const plate = document.createElement("div");
      plate.className = "spPlate";
      const img = document.createElement("img");
      img.src = sponsor.logoUrl;
      img.alt = sponsor.name || "sponsor";
      plate.appendChild(img);
      frame.appendChild(plate);
      logo.appendChild(frame);
    } else {
      const box = document.createElement("div");
      box.className = "spNoLogo";
      box.textContent = sponsor?.name ? "BRAK LOGO" : "SPONSOR";
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
    updateTournamentName(state);

    const sponsors = normalizeSponsors(state);

    if (!sponsors.length) {
      updateDots(0, 0);
      transitionTo({ name: "Brak sponsorów", desc: "Dodaj sponsorów w panelu Control.", logoUrl: "" });
      return;
    }
    if (idx >= sponsors.length) idx = 0;

    updateDots(sponsors.length, idx);
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
