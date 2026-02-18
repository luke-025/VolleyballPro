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
    return window.confirm(`${title}\n\n${message}`);
  }
};
