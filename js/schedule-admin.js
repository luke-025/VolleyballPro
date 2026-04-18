// js/schedule-admin.js
// Tiny PIN-protected admin page that lets the operator type a scheduledAt
// string ("HH:MM") into every match. It uses the existing VPState.mutate
// optimistic-locking helper and does not touch any other field — so the
// rest of the system (engine, standings, playoffs, overlay) is untouched.

(function () {
  const UI = window.VP_UI;
  const STORE = window.VPState;

  const els = {
    slug: document.getElementById("slugBadge"),
    pin: document.getElementById("pin"),
    btnLoad: document.getElementById("btnLoad"),
    tableWrap: document.getElementById("tableWrap"),
    footerRow: document.getElementById("footerRow"),
    dirtyCount: document.getElementById("dirtyCount"),
    btnReset: document.getElementById("btnReset"),
    btnSave: document.getElementById("btnSave"),
    nameSection: document.getElementById("nameSection"),
    tName: document.getElementById("tName"),
    btnSaveName: document.getElementById("btnSaveName"),
    slugHint: document.getElementById("slugHint"),
  };

  const slug = UI.getSlug();
  els.slug.textContent = slug ? `t=${slug}` : "brak slug";

  // Seed PIN from sessionStorage if the operator was already logged in via Control.
  const seeded = slug ? STORE.getPin(slug) : "";
  if (seeded) els.pin.value = seeded;

  let snapshot = null; // { version, state, tournamentId }
  let originalTimes = new Map(); // matchId -> original scheduledAt
  let edits = new Map(); // matchId -> new scheduledAt
  let originalName = ""; // original tournament name (meta.name)

  function stageLabel(key) {
    return UI.stageLabel(key) || key;
  }

  function validTime(v) {
    if (!v) return true; // empty allowed
    return /^\d{1,2}:\d{2}$/.test(v);
  }

  function normalizeTime(v) {
    if (!v) return "";
    const m = /^(\d{1,2}):(\d{2})$/.exec(v);
    if (!m) return v;
    const hh = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2, "0");
    const mm = String(Math.min(59, Math.max(0, parseInt(m[2], 10)))).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function updateDirtyUI() {
    let dirty = 0;
    for (const [id, val] of edits.entries()) {
      const orig = originalTimes.get(id) || "";
      if (normalizeTime(val) !== orig) dirty++;
    }
    els.dirtyCount.textContent = dirty === 0 ? "Brak zmian." : `${dirty} zmian do zapisania.`;
    els.btnSave.disabled = dirty === 0;
    document.querySelectorAll("tr[data-mid]").forEach(tr => {
      const id = tr.getAttribute("data-mid");
      const newVal = normalizeTime(edits.get(id) || "");
      const orig = originalTimes.get(id) || "";
      tr.classList.toggle("dirty", newVal !== orig);
    });
  }

  function renderTable() {
    if (!snapshot) {
      els.tableWrap.innerHTML = `<div class="muted" style="padding: 20px 0; text-align:center;">Wpisz PIN i kliknij "Wczytaj".</div>`;
      els.footerRow.style.display = "none";
      return;
    }
    const state = snapshot.state || {};
    const matches = (state.matches || []).slice();
    const teamName = (id) => (state.teams || []).find(t => t.id === id)?.name || "—";

    if (matches.length === 0) {
      els.tableWrap.innerHTML = `<div class="muted" style="padding: 20px 0; text-align:center;">Turniej nie ma jeszcze meczów.</div>`;
      els.footerRow.style.display = "none";
      return;
    }

    // Sort: by court, then by stage, then by current scheduledAt (lexical, fine for "HH:MM").
    matches.sort((a, b) => {
      const ca = (a.court || "").trim(), cb = (b.court || "").trim();
      const na = Number(ca), nb = Number(cb);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      if (ca !== cb) return ca.localeCompare(cb, "pl");
      const stageOrder = { group: 0, quarterfinal: 10, semifinal: 20, thirdplace: 25, final: 30, place9: 40 };
      const sr = (stageOrder[a.stage] ?? 99) - (stageOrder[b.stage] ?? 99);
      if (sr) return sr;
      return (a.scheduledAt || "").localeCompare(b.scheduledAt || "");
    });

    const rows = matches.map(m => {
      const current = edits.has(m.id) ? (edits.get(m.id) || "") : (m.scheduledAt || "");
      const groupLbl = m.stage === "group" && m.group ? `Grupa ${m.group}` : "";
      return `
        <tr data-mid="${UI.esc(m.id)}">
          <td class="court">${UI.esc((m.court || "").trim() || "—")}</td>
          <td class="stage">${UI.esc(stageLabel(m.stage))}${groupLbl ? " · " + UI.esc(groupLbl) : ""}</td>
          <td>${UI.esc(teamName(m.teamAId))} <span class="muted">vs</span> ${UI.esc(teamName(m.teamBId))}</td>
          <td class="time"><input type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" value="${UI.esc(current)}" /></td>
        </tr>
      `;
    }).join("");

    els.tableWrap.innerHTML = `
      <table class="scheduleTable">
        <thead>
          <tr>
            <th>Boisko</th>
            <th>Etap</th>
            <th>Drużyny</th>
            <th style="width: 110px;">Godzina</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    els.footerRow.style.display = "flex";

    // Wire up per-row inputs.
    els.tableWrap.querySelectorAll("tr[data-mid]").forEach(tr => {
      const id = tr.getAttribute("data-mid");
      const input = tr.querySelector("input");
      input.addEventListener("input", () => {
        edits.set(id, input.value);
        updateDirtyUI();
      });
      input.addEventListener("blur", () => {
        const v = normalizeTime(input.value.trim());
        if (v && !validTime(v)) {
          UI.toast(`Nieprawidłowa godzina: "${input.value}"`, "warn");
        }
        input.value = v;
        edits.set(id, v);
        updateDirtyUI();
      });
    });

    updateDirtyUI();
  }

  async function load() {
    if (!slug) return UI.toast("Brak ?t=slug w URL.", "warn");
    const pin = (els.pin.value || "").trim();
    if (!pin) return UI.toast("Podaj PIN.", "warn");

    try {
      snapshot = await STORE.fetchState(slug);
      if (!snapshot) {
        UI.toast("Turniej nie istnieje.", "error");
        return;
      }
      STORE.setPin(slug, pin);
      originalTimes = new Map(
        (snapshot.state?.matches || []).map(m => [m.id, m.scheduledAt || ""])
      );
      edits = new Map();
      originalName = String(snapshot.state?.meta?.name || "");
      els.tName.value = originalName;
      els.slugHint.textContent = slug;
      els.nameSection.style.display = "block";
      updateNameDirtyUI();
      renderTable();
      UI.toast("Wczytano terminarz.", "success");
    } catch (e) {
      UI.toast(UI.fmtError(e), "error");
    }
  }

  async function save() {
    if (!snapshot) return;
    const pin = (els.pin.value || "").trim();
    if (!pin) return UI.toast("Podaj PIN.", "warn");

    // Validate all edited values first.
    for (const [, v] of edits) {
      if (v && !validTime(v)) {
        return UI.toast(`Popraw godziny w formacie HH:MM.`, "warn");
      }
    }

    els.btnSave.disabled = true;
    try {
      await STORE.mutate(slug, pin, (st) => {
        const matches = (st.matches || []).map(m => {
          if (!edits.has(m.id)) return m;
          const v = normalizeTime(edits.get(m.id) || "");
          if (v === (m.scheduledAt || "")) return m;
          return { ...m, scheduledAt: v, updatedAt: new Date().toISOString() };
        });
        st.matches = matches;
        return st;
      });
      UI.toast("Zapisano.", "success");
      // Reload so we see canonical state.
      snapshot = await STORE.fetchState(slug);
      originalTimes = new Map(
        (snapshot.state?.matches || []).map(m => [m.id, m.scheduledAt || ""])
      );
      edits = new Map();
      renderTable();
    } catch (e) {
      UI.toast(UI.fmtError(e), "error");
    } finally {
      updateDirtyUI();
    }
  }

  function resetEdits() {
    edits = new Map();
    renderTable();
    UI.toast("Odrzucono lokalne zmiany.", "info");
  }

  function updateNameDirtyUI() {
    const current = (els.tName.value || "").trim();
    const isDirty = current !== originalName.trim();
    els.btnSaveName.disabled = !isDirty;
  }

  async function saveName() {
    if (!snapshot) return;
    const pin = (els.pin.value || "").trim();
    if (!pin) return UI.toast("Podaj PIN.", "warn");

    const newName = (els.tName.value || "").trim();
    if (newName === originalName.trim()) return;

    els.btnSaveName.disabled = true;
    try {
      await STORE.mutate(slug, pin, (st) => {
        st.meta = st.meta || {};
        st.meta.name = newName;
        return st;
      });
      originalName = newName;
      UI.toast("Zapisano nazwę turnieju.", "success");
      // Refresh snapshot so subsequent edits see the canonical state.
      snapshot = await STORE.fetchState(slug);
    } catch (e) {
      UI.toast(UI.fmtError(e), "error");
    } finally {
      updateNameDirtyUI();
    }
  }

  els.btnLoad.addEventListener("click", load);
  els.btnSave.addEventListener("click", save);
  els.btnReset.addEventListener("click", resetEdits);
  els.btnSaveName.addEventListener("click", saveName);
  els.tName.addEventListener("input", updateNameDirtyUI);
  els.tName.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !els.btnSaveName.disabled) saveName();
  });
  els.pin.addEventListener("keydown", (e) => {
    if (e.key === "Enter") load();
  });
})();
