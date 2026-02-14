// js/overlay-anim.js
// Adds a subtle "point scored" animation to the OBS overlay whenever score text changes.
// Works with any overlay renderer as long as scores are rendered into elements with:
// - class ".scoreBox" (big points) and/or ".midSets" (sets count)
// No dependencies. Safe to include after your normal overlay.js.

(() => {
  const PULSE_CLASS = "vb-pulse";
  const FLASH_CLASS = "vb-flash";

  function pulse(el) {
    if (!el) return;
    // Restart animation reliably
    el.classList.remove(PULSE_CLASS);
    // force reflow
    void el.offsetWidth;
    el.classList.add(PULSE_CLASS);
  }

  function flash(el) {
    if (!el) return;
    el.classList.remove(FLASH_CLASS);
    void el.offsetWidth;
    el.classList.add(FLASH_CLASS);
  }

  function attachTo(el) {
    if (!el || el.__vbObserved) return;
    el.__vbObserved = true;

    let last = el.textContent;

    const mo = new MutationObserver(() => {
      const now = el.textContent;
      // Ignore purely whitespace changes
      if ((now || "").trim() === (last || "").trim()) return;

      last = now;
      pulse(el);

      // Also flash the nearest team column to give a "who scored" hint
      // (if markup matches .scoreBox adjacent to .scoreCol)
      const scorebar = el.closest(".scorebar");
      if (scorebar) {
        // Determine side: leftmost scoreBox or rightmost
        const boxes = [...scorebar.querySelectorAll(".scoreBox")];
        const idx = boxes.indexOf(el);
        if (idx === 0) flash(scorebar.querySelector(".scoreCol"));
        if (idx === boxes.length - 1) flash(scorebar.querySelector(".scoreCol.right"));
      }
    });

    mo.observe(el, { characterData: true, childList: true, subtree: true });
  }

  function scan() {
    document.querySelectorAll(".scoreBox, .midSets").forEach(attachTo);
  }

  // For elements that appear later (after initial render)
  const rootObserver = new MutationObserver(() => scan());

  function start() {
    scan();
    rootObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
