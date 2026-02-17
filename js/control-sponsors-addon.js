// js/control-sponsors-addon.js
// Sponsors manager for Control (adds UI without modifying control.js)
(function () {
  const UI = window.VP_UI;
  const STORE = window.VPState;

  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  };

  function toast(msg, kind) {
    try { UI.toast(msg, kind || "info"); } catch { console.log(msg); }
  }
  function getSlug() {
    try { return UI.getSlug(); } catch { return ""; }
  }
  function getPin(slug) {
    try { return STORE.getPin(slug) || ""; } catch { return ""; }
  }
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : ("sp_" + Math.random().toString(16).slice(2)));

  let current = null;
  let mounted = false;

  function ensureMount() {
    if (mounted) return;
    mounted = true;

    const host =
      document.getElementById("opFilters") ||
      document.querySelector(".opFilters") ||
      document.querySelector(".grid") ||
      document.querySelector("main") ||
      document.body;

    const card = el("div", { class: "card", id: "sponsorsCard", style: "margin-top:14px" }, [
      el("div", { class: "cardHead" }, [
        el("h3", { style: "margin:0" }, ["Sponsorzy"]),
        el("div", { class: "muted", style: "margin-top:6px" }, ["Scena SPONSORZY + opcjonalny akcent w transmisji."])
      ]),
      el("div", { class: "cardBody" }, [
        el("div", { style: "display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end" }, [
          el("div", { style: "flex:1; min-width:200px" }, [
            el("label", { class: "muted", for: "spName" }, ["Nazwa"]),
            el("input", { id: "spName", class: "input", placeholder: "np. Partner Główny" })
          ]),
          el("div", { style: "flex:2; min-width:300px" }, [
            el("label", { class: "muted", for: "spLogo" }, ["Logo URL"]),
            el("input", { id: "spLogo", class: "input", placeholder: "https://.../logo.png" })
          ]),
          el("div", { style: "flex:1; min-width:160px" }, [
            el("label", { class: "muted", for: "spRole" }, ["Rola"]),
            el("select", { id: "spRole", class: "input" }, [
              el("option", { value: "" }, ["— brak —"]),
              el("option", { value: "Sponsor Główny" }, ["Sponsor Główny"]),
              el("option", { value: "Sponsor" }, ["Sponsor"]),
              el("option", { value: "Partner" }, ["Partner"]),
              el("option", { value: "Organizator" }, ["Organizator"]),
              el("option", { value: "Patron Medialny" }, ["Patron Medialny"]),
            ])
          ]),
          el("button", { class: "btn", id: "spAddBtn", type: "button" }, ["Dodaj"])
        ]),
        el("div", { style: "display:flex; gap:14px; align-items:center; margin-top:12px; flex-wrap:wrap" }, [
          el("label", { style: "display:flex; gap:8px; align-items:center" }, [
            el("input", { id: "spAccentOn", type: "checkbox" }),
            el("span", {}, ["Akcent sponsorów w transmisji (GAME)"])
          ]),
          el("label", { style: "display:flex; gap:8px; align-items:center" }, [
            el("span", { class: "muted" }, ["Rotacja akcentu (s)"]),
            el("input", { id: "spAccentEvery", class: "input", type: "number", min: "2", max: "60", value: "6", style: "width:90px" })
          ]),
          el("label", { style: "display:flex; gap:8px; align-items:center" }, [
            el("span", { class: "muted" }, ["Rotacja sceny sponsorów (s)"]),
            el("input", { id: "spSceneEvery", class: "input", type: "number", min: "2", max: "60", value: "5", style: "width:90px" })
          ]),
          el("label", { style: "display:flex; gap:8px; align-items:center" }, [
            el("span", { class: "muted" }, ["Rotacja widgetu w rogu (s)"]),
            el("input", { id: "spWidgetEvery", class: "input", type: "number", min: "2", max: "120", value: "8", style: "width:90px" })
          ])
        ]),
        el("div", { class: "muted", style: "margin-top:10px" }, [
          "Tip: najlepiej wklejać PNG z przezroczystym tłem (URL do pliku)."
        ]),
        el("div", { id: "spList", style: "margin-top:12px; display:flex; flex-direction:column; gap:10px" }, [])
      ])
    ]);

    host.appendChild(card);

    // Bind actions
    card.querySelector("#spAddBtn").addEventListener("click", onAdd);
    card.querySelector("#spAccentOn").addEventListener("change", onSettings);
    card.querySelector("#spAccentEvery").addEventListener("change", onSettings);
    card.querySelector("#spSceneEvery").addEventListener("change", onSettings);
    card.querySelector("#spWidgetEvery").addEventListener("change", onSettings);

    card.querySelector("#spList").addEventListener("click", async (ev) => {
      const del = ev.target.closest("[data-sp-del]");
      const up = ev.target.closest("[data-sp-up]");
      const down = ev.target.closest("[data-sp-down]");
      const id = (del || up || down)?.getAttribute("data-id");
      if (!id) return;

      ev.preventDefault();
      ev.stopPropagation();

      const slug = getSlug();
      const pin = getPin(slug);
      if (!pin) return toast("Podaj PIN w Control, żeby edytować sponsorów.", "warn");

      try {
        if (del) {
          if (!confirm("Usunąć sponsora?")) return;
          await STORE.mutate(slug, pin, (st) => {
            st.sponsors = (st.sponsors || []).filter(s => s.id !== id);
            return st;
          });
        } else if (up || down) {
          await STORE.mutate(slug, pin, (st) => {
            const arr = (st.sponsors || []).slice();
            const i = arr.findIndex(s => s.id === id);
            if (i < 0) return st;
            const j = up ? Math.max(0, i - 1) : Math.min(arr.length - 1, i + 1);
            const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            st.sponsors = arr;
            return st;
          });
        }
      } catch (e) {
        toast("Błąd: " + (e?.message || e), "err");
      }
    }, true);
  }

  async function onAdd() {
    const slug = getSlug();
    const pin = getPin(slug);
    if (!slug) return toast("Brak slug turnieju.", "warn");
    if (!pin) return toast("Podaj PIN w Control, żeby dodawać sponsorów.", "warn");

    const name    = document.getElementById("spName")?.value?.trim() || "";
    const logoUrl = document.getElementById("spLogo")?.value?.trim() || "";
    const role    = document.getElementById("spRole")?.value?.trim() || "";

    if (!name && !logoUrl) return toast("Wpisz nazwę lub logo URL.", "warn");
    if (logoUrl && !/^https?:\/\//i.test(logoUrl)) return toast("Logo URL musi zaczynać się od http(s)://", "warn");

    try {
      await STORE.mutate(slug, pin, (st) => {
        st.sponsors = st.sponsors || [];
        st.sponsors.push({ id: uid(), name, logoUrl, role, enabled: true });
        st.meta = st.meta || {};
        st.meta.sponsors = st.meta.sponsors || {};
        return st;
      });
      document.getElementById("spName").value = "";
      document.getElementById("spLogo").value = "";
      const roleEl = document.getElementById("spRole");
      if (roleEl) roleEl.value = "";
      toast("Dodano sponsora.", "ok");
    } catch (e) {
      toast("Błąd: " + (e?.message || e), "err");
    }
  }

  async function onSettings() {
    const slug = getSlug();
    const pin = getPin(slug);
    if (!slug || !pin) return;

    const accentOn   = !!document.getElementById("spAccentOn")?.checked;
    const accentEvery = Number(document.getElementById("spAccentEvery")?.value || 6);
    const sceneEvery  = Number(document.getElementById("spSceneEvery")?.value || 5);
    const widgetEvery = Number(document.getElementById("spWidgetEvery")?.value || 8);

    try {
      await STORE.mutate(slug, pin, (st) => {
        st.meta = st.meta || {};
        st.meta.sponsors = st.meta.sponsors || {};
        st.meta.sponsors.accentEnabled = accentOn;
        st.meta.sponsors.accentEvery   = Math.min(60, Math.max(2, accentEvery || 6));
        st.meta.sponsors.sceneEvery    = Math.min(60, Math.max(2, sceneEvery || 5));
        st.meta.sponsors.widgetEvery   = Math.min(120, Math.max(2, widgetEvery || 8));
        return st;
      });
    } catch (e) {
      toast("Błąd ustawień: " + (e?.message || e), "err");
    }
  }

  function render() {
    ensureMount();
    const st = current?.state || {};
    const sponsors = (st.sponsors || []).filter(s => s && (s.name || s.logoUrl));
    const spList = document.getElementById("spList");
    if (!spList) return;

    const settings  = st.meta?.sponsors || {};
    const accentOn  = !!settings.accentEnabled;
    const accentEvery = settings.accentEvery ?? 6;
    const sceneEvery  = settings.sceneEvery  ?? 5;
    const widgetEvery = settings.widgetEvery ?? 8;

    const chk = document.getElementById("spAccentOn");
    if (chk) chk.checked = accentOn;
    const ae = document.getElementById("spAccentEvery");
    if (ae) ae.value = String(accentEvery);
    const se = document.getElementById("spSceneEvery");
    if (se) se.value = String(sceneEvery);
    const we = document.getElementById("spWidgetEvery");
    if (we) we.value = String(widgetEvery);

    spList.innerHTML = "";
    if (!sponsors.length) {
      spList.appendChild(el("div", { class: "muted" }, ["Brak sponsorów. Dodaj pierwszego wyżej."]));
      return;
    }

    sponsors.forEach((s) => {
      const row = el("div", { class: "row", style: "display:flex; gap:10px; align-items:center; justify-content:space-between" }, [
        el("div", { style: "display:flex; gap:10px; align-items:center; min-width:0; flex:1" }, [
          el("div", { style: "width:44px; height:28px; border-radius:10px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08); display:flex; align-items:center; justify-content:center; overflow:hidden" }, [
            s.logoUrl
              ? el("img", { src: s.logoUrl, alt: s.name || "logo", style: "max-width:100%; max-height:100%; object-fit:contain" })
              : el("span", { class: "muted" }, ["—"])
          ]),
          el("div", { style: "min-width:0" }, [
            el("b", { style: "display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis" }, [s.name || "(bez nazwy)"]),
            s.role ? el("div", { class: "muted", style: "font-size:11px; margin-top:1px" }, [s.role]) : el("span"),
            el("div", { class: "muted", style: "white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:520px" }, [s.logoUrl || ""])
          ])
        ]),
        el("div", { style: "display:flex; gap:8px; align-items:center" }, [
          el("button", { class: "btn small", type: "button", "data-sp-up": "1",   "data-id": s.id, title: "Wyżej" }, ["▲"]),
          el("button", { class: "btn small", type: "button", "data-sp-down": "1", "data-id": s.id, title: "Niżej" }, ["▼"]),
          el("button", { class: "btn small danger", type: "button", "data-sp-del": "1", "data-id": s.id }, ["Usuń"])
        ])
      ]);
      spList.appendChild(row);
    });
  }

  async function start() {
    const slug = getSlug();
    if (!slug) return;

    ensureMount();
    STORE.subscribeState(slug, (snap) => {
      current = snap;
      render();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
