/**
 * overlay-sponsors-widget.js
 * Rotating sponsor logo widget in top-right corner
 * Only visible during game scene
 */

(function () {
  "use strict";

  const WIDGET_ID = "sponsorWidget";
  const DEFAULT_INTERVAL = 8; // seconds

  let widget = null;
  let currentIndex = 0;
  let rotationTimer = null;
  let lastState = null;

  function init() {
    widget = document.getElementById(WIDGET_ID);
    if (!widget) {
      console.warn("[SponsorWidget] Element #" + WIDGET_ID + " not found");
      return;
    }

    // Subscribe to state changes
    if (window.STATE && typeof window.STATE.subscribe === "function") {
      window.STATE.subscribe(onStateChange);
    }
  }

  function onStateChange(state) {
    lastState = state;
    const scene = state?.meta?.scene || "game";
    const sponsors = getSponsors(state);

    // Only show widget during game scene
    if (scene !== "game" || !sponsors.length) {
      stopRotation();
      hideWidget();
      return;
    }

    // Start/restart rotation
    startRotation(state);
  }

  function getSponsors(state) {
    const raw = state?.sponsors || [];
    return raw
      .filter((s) => s && s.enabled !== false && (s.logoUrl || s.logo))
      .map((s) => ({
        name: s.name || "Sponsor",
        logo: (s.logoUrl || s.logo || "").trim(),
      }));
  }

  function getInterval(state) {
    const val = state?.meta?.sponsors?.widgetEvery;
    if (typeof val === "number" && val >= 2 && val <= 120) return val;
    return DEFAULT_INTERVAL;
  }

  function startRotation(state) {
    stopRotation();

    const sponsors = getSponsors(state);
    if (!sponsors.length) {
      hideWidget();
      return;
    }

    const interval = getInterval(state);

    // Show first sponsor immediately
    if (currentIndex >= sponsors.length) currentIndex = 0;
    showSponsor(sponsors[currentIndex]);

    // Setup rotation timer
    rotationTimer = setInterval(() => {
      currentIndex = (currentIndex + 1) % sponsors.length;
      showSponsor(sponsors[currentIndex]);
    }, interval * 1000);
  }

  function stopRotation() {
    if (rotationTimer) {
      clearInterval(rotationTimer);
      rotationTimer = null;
    }
  }

  function showSponsor(sponsor) {
    if (!widget) return;

    // Fade out
    widget.classList.remove("show");

    setTimeout(() => {
      // Update content
      widget.innerHTML = `<img src="${escapeHtml(sponsor.logo)}" alt="${escapeHtml(sponsor.name)}" />`;

      // Fade in
      widget.classList.add("show");
    }, 300);
  }

  function hideWidget() {
    if (!widget) return;
    widget.classList.remove("show");
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
