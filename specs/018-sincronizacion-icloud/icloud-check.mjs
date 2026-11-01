// T1 of spec 018: checks iCloud CalDAV behaviour with a real account.
// Usage (from the worktree root): node <this file>
// Reads ICLOUD_TEST_APPLE_ID and ICLOUD_TEST_APP_PASSWORD from .env.local and never prints them.
// Only creates and deletes two calendars named "CaFam prueba T1 …"; the user's calendars are only read.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const require = createRequire(path.join(root, "package.json"));
const tsdav = require("tsdav");

const env = Object.fromEntries(
  readFileSync(path.join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^ICLOUD_TEST_/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const user = env.ICLOUD_TEST_APPLE_ID;
const rawPassword = env.ICLOUD_TEST_APP_PASSWORD;
if (!user || !rawPassword) {
  console.log("Faltan ICLOUD_TEST_APPLE_ID o ICLOUD_TEST_APP_PASSWORD en .env.local");
  process.exit(1);
}

const letters = rawPassword.replace(/[^a-zA-Z]/g, "");
const variants = {
  hyphens: letters.match(/.{1,4}/g).join("-"),
  plain: letters,
  spaces: letters.match(/.{1,4}/g).join(" "),
};

const log = [];
let requests = 0;
const hosts = new Set();
function makeFetch(password) {
  const auth = "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    hosts.add(url.host);
    requests++;
    const headers = new Headers(init.headers);
    headers.set("Authorization", auth);
    const res = await fetch(url, { ...init, headers, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      log.push(`redirect ${res.status} ${url.host} -> ${loc ? new URL(loc, url).host : "?"}`);
      if (loc) return makeFetch(password)(new URL(loc, url).toString(), init);
    }
    return res;
  };
}

function out(label, value) {
  console.log(`(${label}) ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

async function principalStatus(password) {
  const f = makeFetch(password);
  const res = await f("https://caldav.icloud.com/", {
    method: "PROPFIND",
    headers: { Depth: "0", "Content-Type": "application/xml" },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
  });
  return res.status;
}

const ics = (uid, body) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//CaFam//T1//ES\r\n${body}END:VCALENDAR\r\n`;

async function main() {
  // (b) password formats
  const b = {};
  for (const [k, v] of Object.entries(variants)) b[k] = await principalStatus(v);
  out("b formatos de contraseña -> estado HTTP", b);
  const password = Object.entries(b).find(([, s]) => s === 207)?.[0];
  if (!password) {
    out("b", "Ningún formato aceptado: revisa la contraseña. Fin.");
    return;
  }
  const fetchFn = makeFetch(variants[password]);
  // (h) wrong password
  out("h contraseña incorrecta -> estado", await principalStatus("aaaa-bbbb-cccc-dddd"));

  // (a) discovery
  const account = await tsdav.createAccount({
    account: { serverUrl: "https://caldav.icloud.com", accountType: "caldav", credentials: {} },
    headers: {},
    loadCollections: false,
    fetch: fetchFn,
  });
  out("a hosts usados", [...hosts]);
  out("a redirecciones", log);
  out("a homeUrl host", new URL(account.homeUrl).host);

  // (c) calendars
  const calendars = await tsdav.fetchCalendars({
    account,
    fetch: fetchFn,
    props: {
      "d:displayname": {},
      "d:current-user-privilege-set": {},
      "d:owner": {},
      "ca:calendar-color": {},
      "c:supported-calendar-component-set": {},
      "cs:getctag": {},
    },
  });
  out(
    "c calendarios (sin nombres)",
    calendars.map((c, i) => ({
      i,
      components: c.components,
      color: c.calendarColor ?? null,
      path: new URL(c.url).pathname.replace(/^\/\d+\//, "/<dsid>/"),
    })),
  );
  // Raw PROPFIND for privileges and owner, which tsdav does not map.
  const priv = await fetchFn(account.homeUrl, {
    method: "PROPFIND",
    headers: { Depth: "1", "Content-Type": "application/xml" },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"><d:prop><d:current-user-privilege-set/><d:owner/><cs:shared-url/><cs:invite/></d:prop></d:propfind>',
  });
  const privText = await priv.text();
  out("c privilegios distintos vistos", [...new Set(privText.match(/<[a-zA-Z0-9:]*(write-content|write|read|all|bind|unbind|write-properties)\s*\/>/g) ?? [])]);
  out("c hay calendarios compartidos (shared-url/invite)", /shared-url>\s*<|invite>\s*</i.test(privText) || /<[^>]*shared-url[^/]*>[^<]+/.test(privText));

  // (i) timing of a read on the biggest event calendar
  const eventCalendars = calendars.filter((c) => !c.components || c.components.includes("VEVENT"));
  const now = new Date();
  const start = new Date(now); start.setUTCMonth(start.getUTCMonth() - 6);
  const end = new Date(now); end.setUTCMonth(end.getUTCMonth() + 12);
  const timeRange = { start: start.toISOString(), end: end.toISOString() };
  let biggest = { n: -1 };
  for (const cal of eventCalendars) {
    const before = requests; const t0 = Date.now();
    const objs = await tsdav.fetchCalendarObjects({ calendar: cal, timeRange, fetch: fetchFn, useMultiGet: false });
    const took = Date.now() - t0;
    if (objs.length > biggest.n) biggest = { n: objs.length, ms: took, req: requests - before };
  }
  out("i lectura del calendario más grande (objetos, ms, peticiones)", biggest);

  // (g) create two test calendars
  const home = account.homeUrl.endsWith("/") ? account.homeUrl : account.homeUrl + "/";
  const calA = `${home}${randomUUID()}/`;
  const calB = `${home}${randomUUID()}/`;
  const created = [];
  try {
    for (const [url, name] of [[calA, "CaFam prueba T1 A"], [calB, "CaFam prueba T1 B"]]) {
      const r = await tsdav.makeCalendar({
        url,
        props: {
          displayname: name,
          "c:supported-calendar-component-set": { "c:comp": { _attributes: { name: "VEVENT" } } },
        },
        fetch: fetchFn,
      });
      created.push(url);
      out(`g MKCALENDAR ${name}`, r.map((x) => x.status ?? x.ok));
    }
    const rename = await fetchFn(calA, {
      method: "PROPPATCH",
      headers: { "Content-Type": "application/xml" },
      body: '<?xml version="1.0"?><d:propertyupdate xmlns:d="DAV:"><d:set><d:prop><d:displayname>CaFam prueba T1 renombrado</d:displayname></d:prop></d:set></d:propertyupdate>',
    });
    const renameText = await rename.text();
    out("g PROPPATCH displayname -> estado", `${rename.status} ${(renameText.match(/HTTP\/1\.1 \d+[^<]*/g) ?? []).join(" | ")}`);
    const check = await fetchFn(calA, {
      method: "PROPFIND",
      headers: { Depth: "0", "Content-Type": "application/xml" },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>',
    });
    out("g nombre tras renombrar", /renombrado/.test(await check.text()) ? "cambiado" : "sin cambiar");

    // (e) create, change keeping VALARM, delete
    const uid = randomUUID();
    const href = `${calA}${uid}.ics`;
    const one = ics(uid, `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20261101T100000Z\r\nDTSTART:20261110T100000Z\r\nDTEND:20261110T110000Z\r\nSUMMARY:Prueba\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Aviso\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\nEND:VEVENT\r\n`);
    let r = await fetchFn(href, { method: "PUT", headers: { "Content-Type": "text/calendar; charset=utf-8", "If-None-Match": "*" }, body: one });
    out("e PUT crear -> estado, etag", [r.status, Boolean(r.headers.get("etag"))]);
    r = await fetchFn(href, { method: "GET" });
    const etag = r.headers.get("etag");
    const body = await r.text();
    r = await fetchFn(href, { method: "PUT", headers: { "Content-Type": "text/calendar; charset=utf-8", "If-Match": etag }, body: body.replace("SUMMARY:Prueba", "SUMMARY:Prueba cambiada") });
    out("e PUT If-Match cambiar -> estado", r.status);
    r = await fetchFn(href, { method: "PUT", headers: { "Content-Type": "text/calendar; charset=utf-8", "If-Match": etag }, body });
    out("e PUT con ETag viejo -> estado (412 esperado)", r.status);
    r = await fetchFn(href, { method: "GET" });
    const after = await r.text();
    out("e tras cambiar conserva VALARM", /BEGIN:VALARM/.test(after) && /Prueba cambiada/.test(after));

    // (d) series starting 8 months ago, weekly, read in the window
    const sUid = randomUUID();
    const sHref = `${calA}${sUid}.ics`;
    const old = new Date(now); old.setUTCMonth(old.getUTCMonth() - 8);
    const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const series = ics(sUid, `BEGIN:VEVENT\r\nUID:${sUid}\r\nDTSTAMP:20261101T100000Z\r\nDTSTART:${stamp(old)}\r\nDURATION:PT1H\r\nRRULE:FREQ=WEEKLY\r\nSUMMARY:Serie\r\nEND:VEVENT\r\n`);
    r = await fetchFn(sHref, { method: "PUT", headers: { "Content-Type": "text/calendar; charset=utf-8", "If-None-Match": "*" }, body: series });
    out("d PUT serie -> estado", r.status);
    const inWindow = await tsdav.fetchCalendarObjects({ calendar: { url: calA }, timeRange, fetch: fetchFn, useMultiGet: false });
    out("d calendar-query devuelve la serie que empezó antes de la ventana", inWindow.some((o) => o.data?.includes(sUid)));

    // (e) change one occurrence (RECURRENCE-ID) and delete another (EXDATE)
    const occ1 = new Date(old.getTime() + 7 * 86400000 * 40);
    const occ2 = new Date(old.getTime() + 7 * 86400000 * 41);
    r = await fetchFn(sHref, { method: "GET" });
    let sTag = r.headers.get("etag");
    let sBody = await r.text();
    const override = `BEGIN:VEVENT\r\nUID:${sUid}\r\nDTSTAMP:20261101T100000Z\r\nRECURRENCE-ID:${stamp(occ1)}\r\nDTSTART:${stamp(new Date(occ1.getTime() + 3600000))}\r\nDURATION:PT1H\r\nSUMMARY:Serie cambiada una\r\nEND:VEVENT\r\n`;
    sBody = sBody.replace("RRULE:FREQ=WEEKLY", `RRULE:FREQ=WEEKLY\r\nEXDATE:${stamp(occ2)}`).replace(/END:VCALENDAR\s*$/, `${override}END:VCALENDAR\r\n`);
    r = await fetchFn(sHref, { method: "PUT", headers: { "Content-Type": "text/calendar; charset=utf-8", "If-Match": sTag }, body: sBody });
    out("e PUT serie con RECURRENCE-ID y EXDATE -> estado", r.status);
    r = await fetchFn(sHref, { method: "GET" });
    const sAfter = await r.text();
    out("e iCloud conserva la excepción y el EXDATE", /RECURRENCE-ID/.test(sAfter) && /EXDATE/.test(sAfter));

    // (f) MOVE to calendar B
    const moved = `${calB}${uid}.ics`;
    r = await fetchFn(href, { method: "MOVE", headers: { Destination: moved, Overwrite: "F" } });
    out("f MOVE entre calendarios -> estado", r.status);
    r = await fetchFn(moved, { method: "GET" });
    out("f el evento está en el destino", r.status);
    const target = r.status === 200 ? moved : href;
    r = await fetchFn(target, { method: "GET" });
    const dTag = r.headers.get("etag");
    r = await fetchFn(target, { method: "DELETE", headers: dTag ? { "If-Match": dTag } : {} });
    out("e DELETE If-Match -> estado", r.status);
    r = await fetchFn(target, { method: "GET" });
    out("e GET tras borrar -> estado (404 esperado)", r.status);
  } finally {
    for (const url of created) {
      const r = await fetchFn(url, { method: "DELETE" });
      out("g DELETE calendario de prueba -> estado", r.status);
    }
    out("i peticiones totales del script", requests);
    out("a hosts usados (final)", [...hosts]);
  }
}

main().catch((e) => {
  console.log("Error:", e?.message ?? String(e));
  process.exit(1);
});
