/**
 * overlay-sponsors-widget.js
 * Rotujący widget ze sponsorami — wyświetlany w scenie GAME (prawy dolny róg lub dowolna pozycja).
 * Korzysta z VP_UI / VPState (ten sam stack co overlay.js).
 */
(function () {
  "use strict";

  const UI    = window.VP_UI;
  const STORE = window.VPState;

  const WIDGET_ID      = "sponsorWidget";
  const DEFAULT_INTERVAL = 8; // sekund między zmianą sponsora

  let widget       = null;
  let currentIndex = 0;
  let rotationTimer = null;

  /* -------------------------------------------------- */
  /*  CSS – wstrzykujemy raz                            */
  /* -------------------------------------------------- */
  function ensureStyle() {
    if (document.getElementById("vpSponsorWidgetStyle")) return;
    const css = `
      #sponsorWidget {
        position: absolute;
        bottom: 44px;
        right: 44px;
        width: 220px;
        height: 100px;
        border-radius: 18px;
        background: rgba(10, 14, 28, .70);
        border: 1px solid rgba(255,255,255,.12);
        box-shadow: 0 18px 60px rgba(0,0,0,.55);
        backdrop-filter: blur(14px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 14px;
        overflow: hidden;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 380ms ease, transform 380ms ease;
        pointer-events: none;
        z-index: 10;
      }
      #sponsorWidget.show {
        opacity: 1;
        transform: translateY(0);
      }
      #sponsorWidget .sw-label {
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 1.2px;
        text-transform: uppercase;
        color: rgba(255,255,255,.45);
        white-space: nowrap;
      }
      #sponsorWidget .sw-logo {
        width: 100%;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #sponsorWidget .sw-logo img {
        max-width: 100%;
        max-height: 60px;
        object-fit: contain;
        filter: drop-shadow(0 4px 12px rgba(0,0,0,.4));
      }
      #sponsorWidget .sw-name {
        font-size: 13px;
        font-weight: 900;
        color: rgba(255,255,255,.88);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
      }
    `;
    const st = document.createElement("style");
    st.id = "vpSponsorWidgetStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* -------------------------------------------------- */
  /*  Helpers                                           */
  /* -------------------------------------------------- */
  function getSlug() {
    try { return UI.getSlug(); } catch { return ""; }
  }

  function getSponsors(state) {
    return (state?.sponsors || [])
      .filter(s => s && s.enabled !== false && (s.logoUrl || s.logo || s.name))
      .map(s => ({
        name: String(s.name || "").trim(),
        logo: String(s.logoUrl || s.logo || "").trim(),
      }));
  }

  function getInterval(state) {
    const v = state?.meta?.sponsors?.widgetEvery;
    if (typeof v === "number" && v >= 2 && v <= 120) return v;
    return DEFAULT_INTERVAL;
  }

  function esc(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  /* -------------------------------------------------- */
  /*  Wyświetlanie                                      */
  /* -------------------------------------------------- */
  function showSponsor(sponsor) {
    if (!widget) return;
    widget.classList.remove("show");

    setTimeout(() => {
      const logoHtml = sponsor.logo
        ? `<img src="${esc(sponsor.logo)}" alt="${esc(sponsor.name)}" />`
        : "";
      const nameHtml = sponsor.name
        ? `<div class="sw-name">${esc(sponsor.name)}</div>`
        : "";

      widget.innerHTML = `
        <div class="sw-label">Partner</div>
        <div class="sw-logo">${logoHtml}</div>
        ${nameHtml}
      `;
      widget.classList.add("show");
    }, 300);
  }

  function hideWidget() {
    if (!widget) return;
    widget.classList.remove("show");
  }

  /* -------------------------------------------------- */
  /*  Rotacja                                           */
  /* -------------------------------------------------- */
  function stopRotation() {
    if (rotationTimer) { clearInterval(rotationTimer); rotationTimer = null; }
  }

  function startRotation(sponsors, interval) {
    stopRotation();
    if (!sponsors.length) { hideWidget(); return; }

    if (currentIndex >= sponsors.length) currentIndex = 0;
    showSponsor(sponsors[currentIndex]);

    rotationTimer = setInterval(() => {
      currentIndex = (currentIndex + 1) % sponsors.length;
      showSponsor(sponsors[currentIndex]);
    }, interval * 1000);
  }

  /* -------------------------------------------------- */
  /*  Reakcja na zmianę stanu                           */
  /* -------------------------------------------------- */
  function onState(state) {
    const scene    = state?.meta?.scene || "game";
    const sponsors = getSponsors(state);

    if (scene !== "game" || !sponsors.length) {
      stopRotation();
      hideWidget();
      return;
    }

    startRotation(sponsors, getInterval(state));
  }

  /* -------------------------------------------------- */
  /*  Init                                              */
  /* -------------------------------------------------- */
  function init() {
    ensureStyle();
    widget = document.getElementById(WIDGET_ID);

    if (!widget) {
      console.warn("[SponsorWidget] Brak elementu #" + WIDGET_ID + " w HTML");
      return;
    }

    const slug = getSlug();
    if (!slug) return;

    // Subskrybuj zmiany stanu (tak jak overlay.js)
    STORE.subscribeState(slug, (snap) => {
      onState(snap?.state || {});
    });

    // Pierwsze ładowanie
    STORE.fetchState(slug).then(snap => {
      onState(snap?.state || {});
    }).catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
