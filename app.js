/* The Building's Record — Chicago. Main app logic. */
(function () {
  "use strict";

  const $ = sel => document.querySelector(sel);
  const view = $("#view");

  const SOURCE_META = {
    permits: { label: "Building Permits", page: "https://data.cityofchicago.org/Buildings/Building-Permits/ydr8-5enu" },
    violations: { label: "Building Violations", page: "https://data.cityofchicago.org/Buildings/Building-Violations/22u3-xenr" },
    inspections: { label: "Food Inspections", page: "https://data.cityofchicago.org/Health-Human-Services/Food-Inspections/4ijn-s7e5" },
    licenses: { label: "Business Licenses", page: "https://data.cityofchicago.org/Community-Economic-Development/Business-Licenses/r5kz-chrr" },
  };
  const REC_LINKS = {
    permits: "https://data.cityofchicago.org/resource/ydr8-5enu.csv?permit_=",
    violations: "https://data.cityofchicago.org/resource/22u3-xenr.csv?id=",
    inspections: "https://data.cityofchicago.org/resource/4ijn-s7e5.csv?inspection_id=",
    licenses: "https://data.cityofchicago.org/resource/r5kz-chrr.csv?license_id=",
  };

  const fmtMoney = n => n ? "$" + n.toLocaleString("en-US") : "";
  const fmtDate = d => d ? d : "—";

  function countLabel(kind, rec) {
    const c = bCounts(rec);
    if (kind === "permits") return [c[CNT_PERMITS], c[CNT_PERMITS] === 1 ? "permit" : "permits"];
    if (kind === "violations") return [c[CNT_VOPEN] + c[CNT_VCLOSED] + c[CNT_VOTHER], c[CNT_VOPEN] + c[CNT_VCLOSED] + c[CNT_VOTHER] === 1 ? "violation" : "violations"];
    if (kind === "inspections") return [c[CNT_INSP], c[CNT_INSP] === 1 ? "inspection" : "inspections"];
    if (kind === "licenses") return [c[CNT_LTOTAL], c[CNT_LTOTAL] === 1 ? "license" : "licenses"];
  }

  /* ---------- landing ---------- */
  async function renderLanding(notice) {
    let summary = null;
    try { summary = await fetchJSON(DATA_BASE + "summary.json"); } catch (e) { /* tolerate */ }
    let html = `
      <div class="hero">
        <h1>The Building's Record</h1>
        <p class="tagline">Every permit, violation, inspection and license the City of Chicago has on file for a building — searchable by the one thing everyone has: the address.</p>
        <form id="search-form" class="search-box" autocomplete="off">
          <input id="search-input" type="text" placeholder="Try 875 N Michigan Ave, 835 W Addison St, or any Chicago address" aria-label="Chicago address">
          <button type="submit">Look it up</button>
        </form>
        <p class="hint">Landlords and property owners already know their buildings' records. Now the same records are one address away for everyone else.</p>
      </div>`;
    if (notice) html += `<div class="notice">${notice}</div>`;
    if (summary) {
      const s = summary.stats || {};
      html += `
      <div class="stats">
        <div class="stat"><strong>${(s.buildings || 0).toLocaleString()}</strong><span>buildings on file</span></div>
        <div class="stat"><strong>${(s.records ? s.records.permits || 0 : 0).toLocaleString()}</strong><span>permits</span></div>
        <div class="stat"><strong>${(s.records ? s.records.violations || 0 : 0).toLocaleString()}</strong><span>violations</span></div>
        <div class="stat"><strong>${(s.records ? s.records.inspections || 0 : 0).toLocaleString()}</strong><span>food inspections</span></div>
        <div class="stat"><strong>${(s.records ? s.records.licenses || 0 : 0).toLocaleString()}</strong><span>business licenses</span></div>
      </div>`;
      const nb = summary.notable || {};
      const notable = (list, label, fmt) => list && list.length ? `
        <div class="notable-col">
          <h3>${label}</h3>
          <ol>${list.map(r => `<li><a href="#${encodeURIComponent(r.k)}">${esc(r.a)}</a> <span class="dim">— ${fmt(r.c)}</span></li>`).join("")}</ol>
        </div>` : "";
      html += `
      <div class="notable">
        ${notable(nb.open_violations, "Most open violations", c => c[CNT_VOPEN] + " open")}
        ${notable(nb.permits, "Most permits on file", c => c[CNT_PERMITS] + " permits")}
        ${notable(nb.active_licenses, "Most active licenses", c => c[CNT_LACTIVE] + " active")}
      </div>`;
    }
    html += `
      <div class="browse">
        <h2>Browse by street</h2>
        <div class="letters" id="letters"></div>
        <div id="street-list"></div>
      </div>
      <div class="about">
        <h2>What is this?</h2>
        <p>Chicago publishes building permits, building violations, food inspection results, and business licenses on its open data portal. The records exist — but finding them requires knowing each dataset's vocabulary and digging through spreadsheets.</p>
        <p>This site joins all four datasets to street addresses, so you can look up a building the way you'd describe it to a friend. Every record links back to its source. Nothing is inferred; if the city has no record for an address, the site says so.</p>
        <p class="dim">All data from the City of Chicago Data Portal. Build date: ${summary ? esc(summary.built) : "—"}. This is a transparency tool, not legal advice.</p>
      </div>`;
    view.innerHTML = html;
    bindSearch();
    buildLetterGrid();
  }

  function bindSearch() {
    const form = $("#search-form");
    if (!form) return;
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const q = $("#search-input").value;
      if (!q.trim()) return;
      await routeHash("#" + encodeURIComponent(q.trim()));
      history.replaceState(null, "", "#" + encodeURIComponent(q.trim()));
    });
  }

  /* ---------- letter grid + street list ---------- */
  async function buildLetterGrid() {
    const grid = $("#letters");
    if (!grid) return;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    letters.push("other");
    grid.innerHTML = letters.map(l =>
      `<button class="letter" data-letter="${l}">${l === "other" ? "#" : l}</button>`).join("");
    grid.querySelectorAll(".letter").forEach(btn => {
      btn.addEventListener("click", async () => {
        const list = $("#street-list");
        list.innerHTML = "<p class='dim'>Loading…</p>";
        try {
          const data = await fetchJSON(DATA_BASE + "idx/" + btn.dataset.letter + ".json");
          const streets = Object.keys(data.s || {}).sort();
          if (!streets.length) { list.innerHTML = "<p class='dim'>No streets under " + btn.dataset.letter + ".</p>"; return; }
          list.innerHTML = `<h3>Streets — ${btn.dataset.letter === "other" ? "#" : btn.dataset.letter}</h3>
            <div class="street-chips">` + streets.map(sk =>
              `<button class="chip street-chip" data-street="${esc(sk)}">${esc(titleDisplay(sk))}</button>`).join("") + `</div>`;
          list.querySelectorAll(".street-chip").forEach(ch => {
            ch.addEventListener("click", () => renderStreet(ch.dataset.street));
          });
        } catch (e) {
          list.innerHTML = "<p class='dim'>Could not load that street index.</p>";
        }
      });
    });
  }

  async function renderStreet(streetKeyName) {
    const letter = idxLetter(streetKeyName);
    const data = await fetchJSON(DATA_BASE + "idx/" + letter + ".json");
    const numbers = (data.s && data.s[streetKeyName]) || [];
    if (!numbers.length) { view.innerHTML = `<p class="dim">No buildings on ${esc(titleDisplay(streetKeyName))}.</p>`; return; }
    view.innerHTML = `
      <div class="street-view">
        <p><a href="#" class="back">← All streets</a></p>
        <h2>${esc(titleDisplay(streetKeyName))}</h2>
        <p class="dim">${numbers.length.toLocaleString()} buildings on file. Pick a number:</p>
        <input id="street-filter" type="text" placeholder="Filter numbers…" class="search-box small">
        <div class="num-chips" id="num-chips">
          ${numbers.map(n => `<button class="chip num-chip" data-key="${esc(n + " " + streetKeyName)}">${esc(n)}</button>`).join("")}
        </div>
      </div>`;
    const filter = $("#street-filter");
    if (filter) filter.addEventListener("input", () => {
      const q = filter.value.trim();
      document.querySelectorAll(".num-chip").forEach(ch => {
        ch.style.display = !q || ch.dataset.key.startsWith(q) ? "" : "none";
      });
    });
    document.querySelectorAll(".num-chip").forEach(ch => {
      ch.addEventListener("click", () => {
        const key = ch.dataset.key;
        history.pushState(null, "", "#" + encodeURIComponent(key));
        renderBuildingByKey(key);
      });
    });
    const back = view.querySelector(".back");
    if (back) back.addEventListener("click", ev => { ev.preventDefault(); renderLanding(); window.scrollTo(0, 0); });
  }

  /* ---------- building detail ---------- */
  async function findBuilding(key) {
    const prefix = md5(key.toLowerCase()).slice(0, 2);
    const data = await fetchJSON(DATA_BASE + "detail/" + prefix + ".json");
    const recs = data.b || [];
    return recs.find(r => bKey(r) === key) || null;
  }

  function violStatusBadge(st) {
    const s = (st || "").toUpperCase();
    const cls = s.includes("OPEN") ? "badge red" : (s.includes("CLOSED") || s.includes("COMPLIED")) ? "badge green" : "badge gray";
    return `<span class="${cls}">${esc(st || "")}</span>`;
  }

  function inspResultBadge(r) {
    const s = (r || "").toLowerCase();
    const cls = s.startsWith("pass") ? "badge green" : s.startsWith("fail") ? "badge red" : "badge gray";
    return `<span class="${cls}">${esc(r || "")}</span>`;
  }

  // License status: portal codes → consumer vocabulary (dataset description).
  // AAI = issued, AAC = cancelled during term, REV = revoked, REA = revocation
  // appealed, INQ = inquiry. Codes are what the portal stores; labels are what
  // a renter/buyer can act on.
  const LIC_STATUS = {
    "AAI": ["Issued", "badge green"],
    "AAC": ["Cancelled", "badge red"],
    "REV": ["Revoked", "badge red"],
    "REA": ["Revocation appealed", "badge yellow"],
    "INQ": ["Inquiry", "badge gray"],
  };
  function licStatusBadge(s) {
    const t = (s || "").trim().toUpperCase();
    const mapped = LIC_STATUS[t];
    if (mapped) return `<span class="${mapped[1]}">${mapped[0]}</span>`;
    return `<span class="badge gray">${esc(s || "")}</span>`;
  }

  async function renderBuildingByKey(key) {
    view.innerHTML = "<p class='dim'>Looking up " + esc(key) + "…</p>";
    let rec;
    try { rec = await findBuilding(key); } catch (e) { rec = null; }
    if (!rec) {
      await renderStreetFallback(key);
      return;
    }
    renderBuilding(rec);
  }

  async function renderStreetFallback(key) {
    // exact key missed — find the street and show nearby numbers
    const sk = streetKey(key);
    if (!sk) { await renderLanding(`<p class="dim">No records found for “${esc(key)}”. Try browsing by street below.</p>`); return; }
    const letter = idxLetter(sk);
    let streets = null;
    try {
      const data = await fetchJSON(DATA_BASE + "idx/" + letter + ".json");
      streets = data.s || {};
    } catch (e) { streets = null; }
    if (streets && streets[sk]) {
      const nums = streets[sk];
      const typedNum = key.split(" ")[0];
      const normN = n => parseInt(n.replace(/[^0-9]/g, ""), 10) || 0;
      const sorted = nums.slice().sort((a, b) => normN(a) - normN(b));
      const typed = normN(typedNum);
      const nearest = sorted.filter(n => Math.abs(normN(n) - typed) <= 100);
      const shown = nearest.length ? nearest : sorted.slice(0, 20);
      view.innerHTML = `
        <div class="street-view">
          <p><a href="#" class="back">← All streets</a></p>
          <h2>No record at ${esc(key)}</h2>
          <p class="dim">The city has no file at that exact address. ${nearest.length ? "Nearby on " : "Buildings on "}${esc(titleDisplay(sk))}:</p>
          <div class="num-chips">
            ${shown.map(n => `<button class="chip num-chip" data-key="${esc(n + " " + sk)}">${esc(n)}</button>`).join("")}
          </div>
          <p class="dim">If the address is right and the street is missing entirely, the building may have no permits, violations, inspections, or licenses on file.</p>
        </div>`;
      document.querySelectorAll(".num-chip").forEach(ch => {
        ch.addEventListener("click", () => {
          const k = ch.dataset.key;
          history.pushState(null, "", "#" + encodeURIComponent(k));
          renderBuildingByKey(k);
        });
      });
      const back = view.querySelector(".back");
      if (back) back.addEventListener("click", ev => { ev.preventDefault(); renderLanding(); window.scrollTo(0, 0); });
    } else {
      // exact street missing — offer direction/name variants from the same shard
      const variants = Object.keys(streets || {}).filter(s2 =>
        s2 !== sk && streetNameKey(s2) === streetNameKey(sk));
      if (variants.length) {
        view.innerHTML = `
          <div class="street-view">
            <p><a href="#" class="back">← All streets</a></p>
            <h2>No record at ${esc(key)}</h2>
            <p class="dim">That street isn't on file under ${esc(titleDisplay(sk))} — did you mean:</p>
            <div class="street-chips">
              ${variants.map(s2 => `<button class="chip street-chip" data-street="${esc(s2)}">${esc(titleDisplay(s2))}</button>`).join("")}
            </div>
            <p class="dim">Pick a street to see its buildings.</p>
          </div>`;
        view.querySelectorAll(".street-chip").forEach(ch => {
          ch.addEventListener("click", () => renderStreet(ch.dataset.street));
        });
        const back = view.querySelector(".back");
        if (back) back.addEventListener("click", ev => { ev.preventDefault(); renderLanding(); window.scrollTo(0, 0); });
      } else {
        await renderLanding(`<p class="dim">No records found for “${esc(key)}”. Try browsing by street below.</p>`);
      }
    }
  }

  function renderBuilding(rec) {
    const c = bCounts(rec);
    const zip = bZip(rec) ? ", " + esc(bZip(rec)) : "";
    let html = `
      <div class="building">
        <p><a href="#" class="back">← Search again</a></p>
        <h2>${esc(bAddr(rec))}<span class="zip">${zip}</span></h2>
        <div class="count-cards">
          <div class="card ${c[CNT_PERMITS] ? "" : "empty"}"><strong>${c[CNT_PERMITS]}</strong><span>${c[CNT_PERMITS] === 1 ? "permit" : "permits"}</span></div>
          <div class="card ${c[CNT_VOPEN] ? "alert" : c[CNT_VOPEN] + c[CNT_VCLOSED] + c[CNT_VOTHER] ? "" : "empty"}"><strong>${c[CNT_VOPEN]}</strong><span>open ${c[CNT_VOPEN] === 1 ? "violation" : "violations"}</span></div>
          <div class="card"><strong>${c[CNT_VCLOSED] + c[CNT_VOTHER]}</strong><span>closed/other</span></div>
          <div class="card ${c[CNT_INSP] ? "" : "empty"}"><strong>${c[CNT_INSP]}</strong><span>${c[CNT_INSP] === 1 ? "inspection" : "inspections"}</span></div>
          <div class="card ${c[CNT_LACTIVE] ? "" : "empty"}"><strong>${c[CNT_LACTIVE]}</strong><span>active ${c[CNT_LACTIVE] === 1 ? "license" : "licenses"}</span></div>
        </div>`;

    /* permits */
    const permits = bPermits(rec);
    html += `<section class="record-sec">
      <h3><a href="${SOURCE_META.permits.page}" target="_blank" rel="noopener">Building Permits</a>
        <span class="count">${permits.length} of ${c[CNT_PERMITS]} shown</span></h3>`;
    if (!permits.length) html += `<p class="dim">No permit records on file.</p>`;
    else {
      html += `<div class="table-wrap"><table><thead><tr><th>Permit #</th><th>Status</th><th>Type</th><th>Issued</th><th>Work</th><th>Reported cost</th></tr></thead><tbody>`;
      for (const p of permits) {
        html += `<tr>
          <td><a href="${REC_LINKS.permits}${encodeURIComponent(p[P_ID])}" target="_blank" rel="noopener">${esc(p[P_ID])}</a></td>
          <td>${esc(p[P_STATUS])}</td><td>${esc(p[P_TYPE])}</td><td>${fmtDate(p[P_DATE])}</td>
          <td>${esc(p[P_WORK])}</td><td>${fmtMoney(p[P_COST])}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    }
    html += `</section>`;

    /* violations */
    const viols = bViols(rec);
    html += `<section class="record-sec">
      <h3><a href="${SOURCE_META.violations.page}" target="_blank" rel="noopener">Building Violations</a>
        <span class="count">${viols.length} of ${c[CNT_VOPEN] + c[CNT_VCLOSED] + c[CNT_VOTHER]} shown</span></h3>`;
    if (!viols.length) html += `<p class="dim">No violation records on file.</p>`;
    else {
      html += `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Code</th><th>Status</th><th>Description</th><th>Location</th></tr></thead><tbody>`;
      for (const v of viols) {
        html += `<tr>
          <td>${fmtDate(v[V_DATE])}</td><td>${esc(v[V_CODE])}</td>
          <td>${violStatusBadge(v[V_STATUS])}</td><td>${esc(v[V_DESC])}</td><td>${esc(v[V_LOC])}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    }
    html += `</section>`;

    /* inspections */
    const insp = bInsp(rec);
    html += `<section class="record-sec">
      <h3><a href="${SOURCE_META.inspections.page}" target="_blank" rel="noopener">Food Inspections</a>
        <span class="count">${insp.length} of ${c[CNT_INSP]} shown</span></h3>`;
    if (!insp.length) html += `<p class="dim">No food inspection records on file.</p>`;
    else {
      html += `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Result</th><th>Business</th><th>License</th><th>Violations noted</th></tr></thead><tbody>`;
      for (const r of insp) {
        html += `<tr>
          <td>${fmtDate(r[I_DATE])}</td><td>${esc(r[I_TYPE])}</td>
          <td>${inspResultBadge(r[I_RESULT])}</td><td>${esc(r[I_DBA])}</td>
          <td>${r[I_LIC] ? `<a href="${REC_LINKS.inspections}${encodeURIComponent(r[I_LIC])}" target="_blank" rel="noopener">${esc(r[I_LIC])}</a>` : "—"}</td>
          <td class="small">${esc(r[I_TEXT] || "")}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    }
    html += `</section>`;

    /* licenses */
    const lic = bLic(rec);
    html += `<section class="record-sec">
      <h3><a href="${SOURCE_META.licenses.page}" target="_blank" rel="noopener">Business Licenses</a>
        <span class="count">${lic.length} of ${c[CNT_LTOTAL]} shown</span></h3>`;
    if (!lic.length) html += `<p class="dim">No license records on file.</p>`;
    else {
      html += `<div class="table-wrap"><table><thead><tr><th>License</th><th>Business</th><th>Code</th><th>Description</th><th>Status</th><th>Start</th><th>Expires</th></tr></thead><tbody>`;
      for (const l of lic) {
        html += `<tr>
          <td><a href="${REC_LINKS.licenses}${encodeURIComponent(l[L_ID])}" target="_blank" rel="noopener">${esc(l[L_ID])}</a></td>
          <td>${esc(l[L_DBA])}</td><td>${esc(l[L_CODE])}</td><td>${esc(l[L_DESC])}</td>
          <td>${licStatusBadge(l[L_STATUS])}</td><td>${fmtDate(l[L_START])}</td><td>${fmtDate(l[L_EXP])}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    }
    html += `</section>`;

    html += `<p class="dim source-note">Every row links to its source record on the City of Chicago Data Portal. Records shown are the most recent; counts reflect everything on file.</p>`;
    html += `</div>`;
    view.innerHTML = html;
    const back = view.querySelector(".back");
    if (back) back.addEventListener("click", ev => { ev.preventDefault(); renderLanding(); window.scrollTo(0, 0); });
  }

  /* ---------- routing ---------- */
  async function routeHash(hash) {
    const q = decodeURIComponent(hash.replace(/^#/, ""));
    if (!q) { await renderLanding(); return; }
    const key = normalizeInput(q);
    if (!key) { await renderLanding(`<p class="dim">Couldn't read “${esc(q)}” as a Chicago address. Try “835 W Addison St”.</p>`); return; }
    await renderBuildingByKey(key);
  }

  window.addEventListener("hashchange", () => routeHash(location.hash));
  window.addEventListener("popstate", () => routeHash(location.hash));

  renderLanding().then(() => {
    if (location.hash && location.hash.length > 1) routeHash(location.hash);
  });
})();
