// js/util.js
window.VP_UTIL = {
  qs(name) { return new URLSearchParams(location.search).get(name); },
  stageLabels: {
    group: "Grupa",
    quarterfinal: "Ćwierćfinał",
    semifinal: "Półfinał",
    thirdplace: "Mecz o 3 miejsce",
    final: "Finał",
    place9: "Miejsca 9–12",
  },
  stages() { return ["group","quarterfinal","semifinal","thirdplace","final","place9"]; },
  groupsFromTeams(teams) {
    const set = new Set();
    (teams||[]).forEach(t => t.group && set.add(t.group));
    return Array.from(set).sort();
  },
  deviceId() {
    const k="vp_device_id";
    let v=localStorage.getItem(k);
    if(!v){
      v = (crypto?.randomUUID?.() || ("dev_"+Math.random().toString(16).slice(2)+Date.now()));
      localStorage.setItem(k,v);
    }
    return v;
  },
  nowIso(){ return new Date().toISOString(); },
  deepClone(obj){ return JSON.parse(JSON.stringify(obj)); },
};
