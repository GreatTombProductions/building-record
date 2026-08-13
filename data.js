/* The Building's Record — Chicago
 * Data layer + address normalizer (JS mirror of pipeline/normalize.py).
 *
 * BUILDING RECORD accessors (positional array — coupled pair with build.py):
 *   [0] v    schema version
 *   [1] a    display address
 *   [2] k    canonical key
 *   [3] z    zip
 *   [4] c    counts [permits, vOpen, vClosed, vOther, inspections, lActive, lTotal]
 *   [5] p    permits    [id, status, type, date, workType, cost]     cap 150
 *   [6] vo   violations [date, code, status, desc, loc]              cap 100
 *   [7] i    inspections [date, type, results, dba, license, zip, vtext] cap 100
 *   [8] l    licenses   [id, dba, legal, code, desc, status, start, exp] cap 100
 */
const DATA_BASE = "data/";

const bAddr = o => o[1];
const bKey = o => o[2];
const bZip = o => o[3];
const bCounts = o => o[4];
const bPermits = o => o[5];
const bViols = o => o[6];
const bInsp = o => o[7];
const bLic = o => o[8];
// counts index
const CNT_PERMITS = 0, CNT_VOPEN = 1, CNT_VCLOSED = 2, CNT_VOTHER = 3,
      CNT_INSP = 4, CNT_LACTIVE = 5, CNT_LTOTAL = 6;
// permit record index
const P_ID = 0, P_STATUS = 1, P_TYPE = 2, P_DATE = 3, P_WORK = 4, P_COST = 5;
// violation record index
const V_DATE = 0, V_CODE = 1, V_STATUS = 2, V_DESC = 3, V_LOC = 4;
// inspection record index
const I_DATE = 0, I_TYPE = 1, I_RESULT = 2, I_DBA = 3, I_LIC = 4, I_ZIP = 5, I_TEXT = 6;
// license record index
const L_ID = 0, L_DBA = 1, L_LEGAL = 2, L_CODE = 3, L_DESC = 4, L_STATUS = 5, L_START = 6, L_EXP = 7;

/* ---------------- address normalization (mirror of normalize.py) ---------------- */

const DIR_MAP = { N: "N", NORTH: "N", S: "S", SOUTH: "S", E: "E", EAST: "E", W: "W", WEST: "W" };
const TYPE_MAP = {
  ALY: "ALLEY", ALLEY: "ALLEY", AVE: "AVENUE", AVENUE: "AVENUE", AV: "AVENUE",
  BLVD: "BOULEVARD", BOULEVARD: "BOULEVARD", BR: "BRANCH", BRANCH: "BRANCH",
  BYWY: "BROADWAY", BROADWAY: "BROADWAY", CIR: "CIRCLE", CIRCLE: "CIRCLE",
  CT: "COURT", COURT: "COURT", DR: "DRIVE", DRIVE: "DRIVE",
  EXPY: "EXPRESSWAY", EXPRESSWAY: "EXPRESSWAY", GDNS: "GARDENS", GARDENS: "GARDENS",
  GLN: "GLEN", GLEN: "GLEN", HWY: "HIGHWAY", HIGHWAY: "HIGHWAY",
  LN: "LANE", LANE: "LANE", MALL: "MALL", MT: "MOUNT", MOUNT: "MOUNT",
  PKWY: "PARKWAY", PARKWAY: "PARKWAY", PL: "PLACE", PLACE: "PLACE",
  PLZ: "PLAZA", PLAZA: "PLAZA", RD: "ROAD", ROAD: "ROAD", ROW: "ROW",
  SQ: "SQUARE", SQUARE: "SQUARE", ST: "STREET", STREET: "STREET",
  TER: "TERRACE", TERRACE: "TERRACE", TRL: "TRAIL", TRAIL: "TRAIL", WAY: "WAY",
};

const STR_RE = /^\s*(\d[\dA-Za-z]*(?:\s*[-/]\s*\d[\dA-Za-z]*)?)(?:\s+(N|S|E|W|NORTH|SOUTH|EAST|WEST))?\s+(.+?)\s*$/i;

const UNIT_RE = /(?:\s+(?:APT|APARTMENT|UNIT|SUITE|STE|RM|ROOM|FL|FLOOR|DEP|DEPT|BSMT|BASEMENT|BLDG|BUILDING)(?:\s+[A-Z0-9][A-Z0-9\-]*)?|\s+#\s*[A-Z0-9\-]+|\s+\d+(?:ST|ND|RD|TH)|\s+\d+\s*[A-Z]?|\s+[A-Z](?:\s+AND\s+[A-Z])?)$/i;

const TYPE_TOKEN_RE = /\s+(ALY|ALLEY|AVE|AVENUE|AV|BLVD|BOULEVARD|BR|BRANCH|BYWY|BROADWAY|CIR|CIRCLE|CT|COURT|DR|DRIVE|EXPY|EXPRESSWAY|GDNS|GARDENS|GLN|GLEN|HWY|HIGHWAY|LN|LANE|MALL|MT|MOUNT|PKWY|PARKWAY|PL|PLACE|PLZ|PLAZA|RD|ROAD|ROW|SQ|SQUARE|ST|STREET|TER|TERRACE|TRL|TRAIL|WAY)\s*$/i;

const JUNK_TOKEN_RE = /^(?:[0-9]+[A-Za-z]?|[A-Z][0-9]+|[0-9]+(?:ST|ND|RD|TH)|&|AND|[A-Z]|#|CVS[0-9]*|GROUND|FIRST|SECOND|THIRD|NONE|NA|LOWER|LEVEL|LL|GL|BSMT|BASEMENT|BASEMAN|PH|PENTHOUSE|TERM|FLR|FLOOR|EAST|WEST|NORTH|SOUTH|STOREFRONT|STORE|REAR|FRONT|FRNT|UNIT|SUITE|STE|APT|RM|ROOM|HSE|MEZZ|GROUN|SPC|LOBBY|CONCOURSE|DOCK|LVL|GIFT|SHOP|INSIDE|\|)$/i;

function splitType(rest) {
  const tokens = rest.split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].toUpperCase().replace(/\.$/, "");
    if (TYPE_MAP[t]) {
      const after = tokens.slice(i + 1);
      if (after.every(a => JUNK_TOKEN_RE.test(a))) {
        const name = tokens.slice(0, i).join(" ").trim();
        return name ? [name, TYPE_MAP[t]] : null;
      }
    }
  }
  return null;
}

function stripTrailingJunk(rest) {
  const tokens = rest.split(/\s+/);
  while (tokens.length > 1 && JUNK_TOKEN_RE.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

function cleanToken(tok) {
  return tok.toUpperCase().replace(/\./g, " ").replace(/,/g, " ").replace(/-/g, " ")
    .replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

function stripUnit(text) {
  let prev = null;
  while (prev !== text) {
    prev = text;
    text = text.replace(UNIT_RE, "").trim();
    if (!text) break;
  }
  return text;
}

function parseFullAddress(raw) {
  if (!raw) return null;
  const t = raw.replace(/\s+/g, " ").trim();
  const m = STR_RE.exec(t);
  if (!m) return null;
  let number = m[1], dirRaw = m[2], rest = m[3].replace(/-/g, " ").replace(/,/g, " ").replace(/\./g, " ").replace(/\//g, " ").replace(/&/g, " & ");
  rest = stripUnit(rest);
  if (!rest) return null;
  const dirFull = dirRaw ? DIR_MAP[dirRaw.toUpperCase()] : null;
  let name, typeFull;
  const split = splitType(rest);
  if (split) {
    name = split[0]; typeFull = split[1];
  } else {
    name = stripTrailingJunk(rest);
    typeFull = null;
  }
  name = cleanToken(name);
  if (!name) return null;
  return [number, dirFull, name, typeFull];
}

function normalizeComponents(number, direction, name, typeRaw) {
  number = (number || "").trim();
  if (!number || !name) return null;
  number = number.replace(/^0+(\d)/, "$1");
  const dirFull = direction ? DIR_MAP[direction.trim().toUpperCase()] : null;
  name = cleanToken(name);
  let typeFull = null;
  if (typeRaw && typeRaw.trim()) typeFull = TYPE_MAP[typeRaw.trim().toUpperCase()];
  if (!typeFull) {
    const tm = TYPE_TOKEN_RE.exec(name);
    if (tm) {
      typeFull = TYPE_MAP[tm[1].toUpperCase()];
      name = name.slice(0, tm.index).trim();
    }
  }
  if (!name) return null;
  return [number, dirFull, name, typeFull];
}

function canonicalKey(parts) {
  const [number, dirFull, name, typeFull] = parts;
  const out = [number];
  if (dirFull) out.push(dirFull);
  out.push(name);
  if (typeFull) out.push(typeFull);
  return out.join(" ");
}

function normalize(raw) {
  const parts = typeof raw === "string" ? parseFullAddress(raw) : normalizeComponents(raw.number, raw.direction, raw.name, raw.type);
  if (!parts) return null;
  return canonicalKey(parts);
}

function normalizeInput(userText) {
  if (!userText) return null;
  let t = userText.trim();
  t = t.replace(/\bCHICAGO\b/gi, "");
  t = t.replace(/\bIL(?:LINOIS)?\b/gi, "");
  t = t.replace(/\b\d{5}(?:-\d{4})?\b/g, "");
  return normalize(t);
}

function streetKey(canonical) {
  if (!canonical) return null;
  const i = canonical.indexOf(" ");
  return i < 0 ? null : canonical.slice(i + 1);
}

function streetNameKey(street) {
  const parts = street.split(" ");
  if (parts.length && ["N", "S", "E", "W"].includes(parts[0])) return parts.slice(1).join(" ");
  return street;
}

function idxLetter(street) {
  const nk = streetNameKey(street);
  const c = nk && nk[0];
  return c && /[A-Z]/.test(c) ? c.toLowerCase() : "other";
}

function titleDisplay(canonical) {
  const SUF = { AVENUE: "Ave", BOULEVARD: "Blvd", STREET: "St", ROAD: "Rd", DRIVE: "Dr",
    LANE: "Ln", PLACE: "Pl", COURT: "Ct", TERRACE: "Ter", CIRCLE: "Cir",
    PARKWAY: "Pkwy", HIGHWAY: "Hwy", SQUARE: "Sq", TRAIL: "Trl", ALLEY: "Ally",
    EXPRESSWAY: "Expy", GARDENS: "Gdns", GLEN: "Gln", MOUNT: "Mt", PLAZA: "Plz",
    ROW: "Row", WAY: "Way", MALL: "Mall", BRANCH: "Br", BROADWAY: "Bwy" };
  const parts = canonical.split(" ");
  const out = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (p === "N" || p === "S" || p === "E" || p === "W") out.push(p);
    else if (SUF[p]) out.push(SUF[p]);
    else out.push(p.charAt(0) + p.slice(1).toLowerCase());
  }
  return out.join(" ");
}

/* ---------------- md5 (public domain, Joseph Myers) ---------------- */
function md5cycle(x, k) { /* inlined below */ }
/* Compact MD5 implementation */
const md5 = (function () {
  const HEX = "0123456789abcdef";
  function cmn(q, a, b, x, s, t) { a = a + q + x + t; return ((a << s) | (a >>> (32 - s))) + b; }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  function md51(s) {
    const n = s.length, state = [1732584193, -271733879, -1732584194, 271733878];
    let i;
    for (i = 64; i <= n; i += 64) {
      md5cycle(state, md5blk(s.substring(i - 64, i)));
    }
    s = s.substring(i - 64);
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) { md5cycle(state, tail); tail[0] = tail[16] = 0; }
    tail[14] = n * 8;
    md5cycle(state, tail);
    let out = "";
    for (i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const c = (state[i] >>> (j * 8)) & 0xff;
        out += HEX.charAt(c >> 4) + HEX.charAt(c & 15);
      }
    }
    return out;
  }
  function md5blk(s) {
    const md5blks = [];
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }
  function md5cycle(state, k) {
    let a = state[0], b = state[1], c = state[2], d = state[3];
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    state[0] = (a + state[0]) | 0; state[1] = (b + state[1]) | 0;
    state[2] = (c + state[2]) | 0; state[3] = (d + state[3]) | 0;
  }
  return function (s) { return md51(s); };
})();

/* ---------------- fetch helpers ---------------- */
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r.json();
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
