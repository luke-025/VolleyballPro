// js/overlay-sponsors-rotator.js
// SAFE: Sponsors scene only. Shows ONE sponsor at a time and rotates.
// Does NOT touch GAME, does NOT change classes.
// Needs: <div id="sceneSponsors" class="scene"></div> in overlay.html
(function () {
  const UI = window.VP_UI;
  const STORE = window.VPState;

  const STYLE_ID = "vpSponsorsRotatorStyle";

  function getSlug() { try { return UI.getSlug(); } catch { return ""; } }

  let snap = null;
  let idx = 0;
  let intervalId = null;

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
      #sceneSponsors .spStage{
        position:absolute; inset:0;
        display:flex;
        align-items:center;
        justify-content:center;
        padding: clamp(28px, 4vw, 72px);
      }
      /* soft dark wash so logos pop, but still feels "TV" */
      #sceneSponsors .spBackdrop{
        position:absolute; inset:-40px;
        background:
          radial-gradient(1200px 700px at 25% 30%, rgba(150,220,255,.18), rgba(0,0,0,0) 60%),
          radial-gradient(1000px 600px at 75% 35%, rgba(180,120,255,.16), rgba(0,0,0,0) 62%),
          linear-gradient(180deg, rgba(8,10,14,.55), rgba(8,10,14,.35));
        filter: blur(0px);
        opacity:.95;
      }
      #sceneSponsors .spCard{
        position:relative;
        width: min(1100px, 86vw);
        height: min(520px, 64vh);
        border-radius: 28px;
        background: rgba(10,14,28,.25);
        border: 1px solid rgba(255,255,255,.10);
        box-shadow: 0 30px 120px rgba(0,0,0,.55);
        backdrop-filter: blur(16px);
        display:flex;
        align-items:center;
        justify-content:center;
        padding: clamp(22px, 3vw, 44px);
        overflow:hidden;
      }
      #sceneSponsors .spInner{
        width:100%;
        height:100%;
        display:flex;
        align-items:center;
        justify-content:center;
        gap: clamp(18px, 2.6vw, 36px);
        flex-direction:column;
        text-align:center;
      }
      #sceneSponsors .spLogo{
        width:100%;
        height:70%;
        display:flex;
        align-items:center;
        justify-content:center;
      }
      #sceneSponsors .spLogo img{
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 18px 60px rgba(0,0,0,.45));
      }
      #sceneSponsors .spName{
        font-weight: 950;
        letter-spacing: .6px;
        color: rgba(255,255,255,.95);
        font-size: clamp(26px, 3.0vw, 44px);
        line-height: 1.05;
        max-width: 92%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #sceneSponsors .spDesc{
        margin-top: -6px;
        color: rgba(255,255,255,.72);
        font-size: clamp(16px, 1.7vw, 22px);
        font-weight: 650;
        letter-spacing: .2px;
        max-width: 92%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #sceneSponsors .spBadge{
        position:absolute;
        top: 22px;
        left: 22px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.10);
        color: rgba(255,255,255,.92);
        font-weight: 900;
        letter-spacing: 2px;
        text-transform: uppercase;
        font-size: 12px;
        backdrop-filter: blur(12px);
      }

      /* fade transition */
      #sceneSponsors .spCard{
        opacity: 0;
        transform: translateY(10px) scale(.995);
        transition: opacity 420ms ease, transform 420ms ease;
      }
      #sceneSponsors .spCard.isVisible{
        opacity: 1;
        transform: translateY(0px) scale(1);
      }

      /* When sponsor has NO logo, make it look intentional */
      #sceneSponsors .spNoLogo{
        height:70%;
        width:100%;
        display:flex;
        align-items:center;
        justify-content:center;
        border-radius: 22px;
        background: rgba(255,255,255,.05);
        border: 1px dashed rgba(255,255,255,.14);
        color: rgba(255,255,255,.7);
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

    // Clear previous markup inserted by older add-ons, but ONLY inside sceneSponsors.
    // (If you had custom manual content there, remove this block.)
    if (!host.querySelector(".spStage")) {
      host.innerHTML = "";
      const backdrop = document.createElement("div");
      backdrop.className = "spBackdrop";

      const stage = document.createElement("div");
      stage.className = "spStage";
      stage.innerHTML = `
        <div class="spCard" id="spCard">
          <div class="spBadge">Sponsor</div>
          <div class="spInner">
            <div class="spLogo" id="spLogo"></div>
            <div class="spName" id="spName"></div>
            <div class="spDesc" id="spDesc"></div>
          </div>
        </div>
      `;

      host.appendChild(backdrop);
      host.appendChild(stage);
    }
    return host;
  }

  function normalizeSponsors(state) {
    const list = (state.sponsors || [])
      .filter(s => s && (s.logoUrl || s.name) && s.enabled !== false)
      .map(s => ({
        name: String(s.name || "").trim(),
        desc: String(s.desc || s.description || s.tagline || "").trim(),
        logoUrl: String(s.logoUrl || s.logo || "").trim(),
      }));
    return list;
  }

  function setCard(sponsor) {
    ensureDOM();
    const card = document.getElementById("spCard");
    const logo = document.getElementById("spLogo");
    const name = document.getElementById("spName");
    const desc = document.getElementById("spDesc");
    if (!card || !logo || !name || !desc) return;

    // reset
    logo.innerHTML = "";
    name.textContent = sponsor?.name || "";
    desc.textContent = sponsor?.desc || "";

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

    // Hide desc if empty (keeps spacing clean)
    desc.style.display = sponsor?.desc ? "block" : "none";

    // Trigger fade in
    requestAnimationFrame(() => {
      card.classList.remove("isVisible");
      // force reflow
      void card.offsetHeight;
      card.classList.add("isVisible");
    });
  }

  function rotate(state) {
    const sponsors = normalizeSponsors(state);
    if (!sponsors.length) {
      setCard({ name: "Brak sponsorów", desc: "Dodaj sponsorów w panelu Control.", logoUrl: "" });
      return;
    }
    if (idx >= sponsors.length) idx = 0;
    setCard(sponsors[idx]);
    idx = (idx + 1) % sponsors.length;
  }

  function schedule(state) {
    const every = Math.min(120, Math.max(2, Number(state.meta?.sponsors?.sceneEvery || 6)));
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
      rotate(snap?.state || {});
    }, every * 1000);
  }

  function start() {
    const slug = getSlug();
    if (!slug) return;

    ensureDOM();

    // Subscribe
    STORE.subscribeState(slug, (s) => {
      snap = s;
      // Whenever state changes, refresh immediately and re-schedule rotation
      rotate(s.state || {});
      schedule(s.state || {});
    });

    // Fallback initial fetch
    STORE.fetchState(slug).then((s) => {
      if (!snap) snap = s;
      rotate(s.state || {});
      schedule(s.state || {});
    }).catch(() => {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
