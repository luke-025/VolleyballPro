// js/control-sponsors.js
// Sponsors (full-screen image boards) management for VolleyballPro.
// Stores in state.meta.sponsors = [{url, title}] and meta.sponsorsIntervalSec / meta.sponsorsEnabled
(function () {
  const UI = window.VP_UI;
  const STORE = window.VPState;

  if (!UI || !STORE) {
    console.warn("[control-sponsors] Missing VP_UI or VPState");
    return;
  }

  const slug = UI.getSlug();
  if (!slug) return;

  const els = {
    url: document.getElementById("spUrl"),
    title: document.getElementById("spTitle"),
    add: document.getElementById("spAdd"),
    clear: document.getElementById("spClear"),
    list: document.getElementById("spList"),
    count: document.getElementById("spCount"),
    interval: document.getElementById("spInterval"),
    enabled: document.getElementById("spEnabled"),
  };

  function normUrl(u) {
    return (u || "").trim();
  }

  function safeMeta(state) {
    state.meta = state.meta || {};
    state.meta.sponsors = Array.isArray(state.meta.sponsors) ? state.meta.sponsors : [];
    if (typeof state.meta.sponsorsIntervalSec !== "number") state.meta.sponsorsIntervalSec = 8;
    if (typeof state.meta.sponsorsEnabled !== "boolean") state.meta.sponsorsEnabled = true;
    return state;
  }

  function render(state) {
    const meta = (state && state.meta) ? state.meta : {};
    const sponsors = Array.isArray(meta.sponsors) ? meta.sponsors : [];
    const interval = typeof meta.sponsorsIntervalSec === "number" ? meta.sponsorsIntervalSec : 8;
    const enabled = meta.sponsorsEnabled !== false;

    if (els.count) els.count.textContent = String(sponsors.length);

    if (els.interval && document.activeElement !== els.interval) els.interval.value = String(interval);
    if (els.enabled && document.activeElement !== els.enabled) els.enabled.value = enabled ? "on" : "off";

    if (!els.list) return;

    if (!sponsors.length) {
      els.list.innerHTML = `<div class="muted small">Brak sponsorów. Dodaj URL powyżej.</div>`;
      return;
    }

    const wrap = document.createElement("div");
    sponsors.forEach((sp, idx) => {
      const row = document.createElement("div");
      row.className = "row";
      const title = sp.title ? ` <span class="muted">— ${escapeHtml(sp.title)}</span>` : "";
      row.innerHTML = `
        <div class="grow">
          <div><b>${idx + 1}.</b>${title}</div>
          <div class="muted small" style="word-break:break-all">${escapeHtml(sp.url || "")}</div>
        </div>
        <div class="btnGroup">
          <button class="btn btn-ghost" data-sp-up="${idx}">↑</button>
          <button class="btn btn-ghost" data-sp-down="${idx}">↓</button>
          <button class="btn btn-danger" data-sp-del="${idx}">Usuń</button>
        </div>
      `;
      wrap.appendChild(row);
    });

    els.list.innerHTML = "";
    els.list.appendChild(wrap);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function mutate(fn) {
    const pin = STORE.getPin(slug);
    if (!pin) {
      alert("Najpierw ustaw PIN w Control (PIN jest potrzebny do zapisu).");
      return;
    }
    await STORE.mutate(slug, pin, (st) => {
      st.meta = st.meta || {};
      st.meta.sponsors = Array.isArray(st.meta.sponsors) ? st.meta.sponsors : [];
      if (typeof st.meta.sponsorsIntervalSec !== "number") st.meta.sponsorsIntervalSec = 8;
      if (typeof st.meta.sponsorsEnabled !== "boolean") st.meta.sponsorsEnabled = true;
      return fn(st);
    });
  }

  if (els.add) els.add.addEventListener("click", async () => {
    const url = normUrl(els.url?.value);
    const title = (els.title?.value || "").trim();
    if (!url) return alert("Wklej URL do grafiki sponsora.");
    await mutate((st) => {
      st.meta.sponsors.push({ url, title });
      return st;
    });
    if (els.url) els.url.value = "";
    if (els.title) els.title.value = "";
  });

  if (els.clear) els.clear.addEventListener("click", async () => {
    if (!confirm("Usunąć wszystkich sponsorów?")) return;
    await mutate((st) => {
      st.meta.sponsors = [];
      return st;
    });
  });

  if (els.interval) els.interval.addEventListener("change", async () => {
    const v = Number(els.interval.value || 8);
    const sec = Math.max(2, Math.min(60, isFinite(v) ? v : 8));
    await mutate((st) => {
      st.meta.sponsorsIntervalSec = sec;
      return st;
    });
  });

  if (els.enabled) els.enabled.addEventListener("change", async () => {
    const on = els.enabled.value === "on";
    await mutate((st) => {
      st.meta.sponsorsEnabled = on;
      return st;
    });
  });

  // Delegate list buttons
  document.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const up = t.getAttribute("data-sp-up");
    const down = t.getAttribute("data-sp-down");
    const del = t.getAttribute("data-sp-del");

    if (up !== null) {
      const idx = Number(up);
      await mutate((st) => {
        const arr = st.meta.sponsors;
        if (idx <= 0 || idx >= arr.length) return st;
        const tmp = arr[idx - 1];
        arr[idx - 1] = arr[idx];
        arr[idx] = tmp;
        return st;
      });
    } else if (down !== null) {
      const idx = Number(down);
      await mutate((st) => {
        const arr = st.meta.sponsors;
        if (idx < 0 || idx >= arr.length - 1) return st;
        const tmp = arr[idx + 1];
        arr[idx + 1] = arr[idx];
        arr[idx] = tmp;
        return st;
      });
    } else if (del !== null) {
      const idx = Number(del);
      await mutate((st) => {
        st.meta.sponsors.splice(idx, 1);
        return st;
      });
    }
  });

  // Initial fetch + realtime
  STORE.fetchState(slug).then(snap => {
    if (snap && snap.state) render(snap.state);
  }).catch(console.error);

  STORE.subscribeState(slug, (snap) => {
    render(snap.state);
  });
})();
