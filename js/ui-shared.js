// js/ui-shared.js
window.VP_UI = {
  STAGES: [
    { key: "group", label: "Grupa" },
    { key: "quarterfinal", label: "Ćwierćfinał" },
    { key: "semifinal", label: "Półfinał" },
    { key: "thirdplace", label: "Mecz o 3 miejsce" },
    { key: "final", label: "Finał" },
    { key: "place9", label: "Miejsca 9–12" },
  ],
  stageLabel(key) {
    return (this.STAGES.find(s => s.key === key)?.label) || key;
  },
  getSlug() {
    const p = new URLSearchParams(location.search);
    return (p.get("t") || "").trim();
  },
  esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); },
  fmtTeam(team) { return team?.name || "—"; },
  nowISO() { return new Date().toISOString(); },
  toast(msg, kind="info") {
    const el = document.createElement("div");
    el.className = `toast toast-${kind}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(()=>el.classList.add("show"), 10);
    setTimeout(()=>{
      el.classList.remove("show");
      setTimeout(()=>el.remove(), 300);
    }, 2800);
  },
  confirmDialog(title, message) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "confirmOverlay";
      overlay.innerHTML = `
        <div class="confirmModal">
          <div class="confirmTitle">${title}</div>
          ${message ? `<div class="confirmMsg">${message}</div>` : ""}
          <div class="confirmBtns">
            <button class="btn btn-ghost confirmCancel">Anuluj</button>
            <button class="btn btn-primary confirmOk">Potwierdź</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = (result) => { overlay.remove(); resolve(result); };
      overlay.querySelector(".confirmOk").addEventListener("click", () => close(true));
      overlay.querySelector(".confirmCancel").addEventListener("click", () => close(false));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
    });
  },
  withLoading(btn, fn) {
    if (btn.disabled) return Promise.resolve();
    btn.disabled = true;
    return Promise.resolve(fn()).finally(() => { btn.disabled = false; });
  },
  fmtError(e) {
    const msg = (e?.message || String(e)).toLowerCase();
    if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed"))
      return "Brak połączenia z serwerem.";
    if (msg.includes("version conflict"))
      return "Dane zostały właśnie zmienione. Spróbuj ponownie.";
    if (msg.includes("invalid pin") || msg.includes("wrong pin") || msg.includes("bad pin"))
      return "Błędny PIN.";
    if (msg.includes("tournament not found"))
      return "Turniej nie istnieje.";
    return e?.message || "Nieznany błąd.";
  }
};
