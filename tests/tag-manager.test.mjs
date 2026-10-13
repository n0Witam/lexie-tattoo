import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { PUBLIC_PAGES } from "../scripts/build-languages.mjs";

const script = await readFile(new URL("../assets/js/consent.js", import.meta.url), "utf8");
const lifetime = 180 * 24 * 60 * 60 * 1000;
const initialTime = Date.UTC(2026, 9, 13);
const record = (analytics, savedAt = initialTime) => JSON.stringify({ version: 1, analytics, savedAt, expiresAt: savedAt + lifetime });

function browser({ saved = null, blocked = false, fullStorage = false, language = "pl", redirect = false } = {}) {
  let now = initialTime;
  let reloads = 0;
  const storage = new Map(saved ? [["lexie-consent", saved]] : []);
  const requests = [];
  const timers = new Map();
  const cookies = new Map([["_ga", "old-id"], ["_ga_H3EH3ETSMH", "old-session"], ["essential", "keep"]]);
  const events = {};
  const cookieWrites = [];
  const element = () => ({ hidden: false, isConnected: true, textContent: "", events: {},
    addEventListener(name, fn) { this.events[name] = fn; }, setAttribute() {}, focus() {},
  });
  const settings = element();
  let panel;
  const document = {
    currentScript: { src: "https://lexie.test/assets/js/consent.js" },
    documentElement: { lang: language, dataset: { languageRedirecting: redirect ? "true" : "false" } },
    visibilityState: "visible",
    head: { appendChild(el) { requests.push(el); } },
    body: { appendChild(el) { panel = el; } },
    createElement(tag) {
      if (tag === "script") return {};
      const section = element();
      const children = {};
      section.querySelector = selector => children[selector] ||= element();
      return section;
    },
    querySelectorAll() { return [settings]; },
    addEventListener(name, fn) { events[`document:${name}`] = fn; },
    get cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join("; "); },
    set cookie(value) { cookieWrites.push(value); if (value.includes("Max-Age=0")) cookies.delete(value.split("=")[0]); },
  };
  const existingEvent = { event: "existing-event" };
  const window = { dataLayer: [existingEvent],
    addEventListener(name, fn) { events[`window:${name}`] = fn; },
    setTimeout(fn, delay) { const key = Symbol(); timers.set(key, { fn, delay }); return key; },
    clearTimeout(key) { timers.delete(key); },
  };
  const location = { hostname: "lexie.test", pathname: "/faq/zapisy-i-ceny/", reload() { reloads++; } };
  const localStorage = {
    getItem(key) { if (blocked) throw Error("blocked"); return storage.get(key) ?? null; },
    setItem(key, value) { if (blocked || fullStorage) throw Error("blocked or full"); storage.set(key, value); },
    removeItem(key) { if (blocked) throw Error("blocked"); storage.delete(key); },
  };
  class Clock extends Date { static now() { return now; } }
  runInNewContext(script, { document, window, location, localStorage, URL, Date: Clock });
  return {
    requests, storage, cookies, cookieWrites, window, timers,
    get panel() { return panel; }, get reloads() { return reloads; },
    ready() { events["document:DOMContentLoaded"]?.(); },
    choose(analytics) { panel.querySelector(analytics ? "[data-consent-accept]" : "[data-consent-reject]").events.click(); },
    open() { settings.events.click(); },
    otherTab(value) {
      if (value === null) storage.delete("lexie-consent");
      else storage.set("lexie-consent", value);
      events["window:storage"]({ key: "lexie-consent", newValue: value });
    },
    expire() { now += lifetime + 1; events["document:visibilitychange"](); },
  };
}

test("all public PL/EN pages bootstrap consent before any measurement and offer settings and privacy", async () => {
  for (const prefix of ["", "en/"]) for (const page of PUBLIC_PAGES) {
    const path = `${prefix}${page}`;
    const html = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.equal([...html.matchAll(/<script src="[^"]*assets\/js\/consent\.js/g)].length, 1, path);
    assert(html.indexOf("language.js") < html.indexOf("consent.js"), path);
    assert(html.indexOf("consent.js") < html.indexOf("theme.js"), path);
    assert.doesNotMatch(html, /googletagmanager\.com|gtag\/js/, path);
    assert.match(html, /<footer[\s\S]*data-cookie-settings hidden/, path);
    assert.match(html, /footer__privacy" href="[^" ]*privacy\//, path);
  }
});

test("no choice or rejection sends no Google requests; necessary cookies survive cleanup", () => {
  const b = browser();
  assert.equal(b.requests.length, 0);
  assert.equal(b.window["ga-disable-G-H3EH3ETSMH"], true);
  assert.equal(b.window.dataLayer[0].event, "existing-event");
  assert.equal(b.window.dataLayer[1][0], "consent");
  assert.equal(b.window.dataLayer[1][2].analytics_storage, "denied");
  assert.equal(b.cookies.has("_ga"), false);
  assert.equal(b.cookies.get("essential"), "keep");
  b.ready(); assert.equal(b.panel.hidden, false);
  b.choose(false);
  assert.equal(b.panel.hidden, true);
  assert.equal(b.requests.length, 0);
  assert.equal(JSON.parse(b.storage.get("lexie-consent")).analytics, false);
  const next = browser({ saved: b.storage.get("lexie-consent") });
  next.ready(); assert.equal(next.panel.hidden, true); assert.equal(next.requests.length, 0);
});

test("acceptance grants analytics only, loads one async GTM, and is restored on subsequent pages", () => {
  const b = browser(); b.ready(); b.choose(true);
  assert.equal(b.requests.length, 1);
  assert.equal(b.requests[0].src, "https://www.googletagmanager.com/gtm.js?id=GTM-5245GRKX");
  assert.equal(b.requests[0].async, true);
  const commands = b.window.dataLayer;
  const update = commands.find(item => item[0] === "consent" && item[1] === "update");
  assert.equal(update[2].analytics_storage, "granted");
  for (const key of ["ad_storage", "ad_user_data", "ad_personalization"]) assert.equal(update[2][key], "denied");
  assert(commands.indexOf(update) < commands.findIndex(item => item.event === "gtm.js"));
  b.open(); b.choose(true); assert.equal(b.requests.length, 1);
  const next = browser({ saved: b.storage.get("lexie-consent") });
  assert.equal(next.requests.length, 1);
  assert.equal(next.window.dataLayer[1][2].analytics_storage, "granted");
  next.ready(); assert.equal(next.panel.hidden, true);
});

test("withdrawal disables GA, clears its cookies and reloads into a state that does not load GTM", () => {
  const b = browser({ saved: record(true) }); b.ready();
  b.open(); assert.equal(b.panel.hidden, false);
  b.choose(false);
  assert.equal(b.window["ga-disable-G-H3EH3ETSMH"], true);
  assert.equal(b.reloads, 1);
  assert.equal(b.cookies.has("_ga"), false);
  assert.equal(b.cookies.get("essential"), "keep");
  assert.equal(browser({ saved: b.storage.get("lexie-consent") }).requests.length, 0);
});

test("expired, malformed, future and outdated records cannot authorize measurement", () => {
  for (const saved of ["{", "null", "true", record(true, initialTime - lifetime), record(true, initialTime + 1), record(true).replace('"version":1', '"version":0')]) {
    const b = browser({ saved }); b.ready();
    assert.equal(b.requests.length, 0); assert.equal(b.panel.hidden, false);
  }
  const b = browser({ saved: record(true) }); b.ready(); b.expire();
  assert.equal(b.reloads, 1); assert.equal(b.window["ga-disable-G-H3EH3ETSMH"], true);
});

test("blocked storage is usable for this visit; a full store cannot retain a revoked opt-in", () => {
  const b = browser({ blocked: true }); b.ready(); b.choose(true); assert.equal(b.requests.length, 1);
  b.open(); b.choose(false); assert.equal(b.reloads, 1);
  assert.equal(browser({ blocked: true }).requests.length, 0);
  const full = browser({ saved: record(true), fullStorage: true }); full.ready(); full.open(); full.choose(false);
  assert.equal(full.storage.has("lexie-consent"), false);
});

test("preferences synchronize across tabs, including clearing browser storage", () => {
  const b = browser(); b.ready(); b.otherTab(record(true)); assert.equal(b.requests.length, 1);
  b.otherTab(record(false)); assert.equal(b.reloads, 1);
  const denied = browser({ saved: record(false) }); denied.ready(); denied.otherTab(null);
  assert.equal(denied.panel.hidden, false); assert.equal(denied.requests.length, 0);
});

test("English banner uses English copy; a document being redirected never loads measurement", () => {
  const b = browser({ language: "en" }); b.ready();
  assert.match(b.panel.innerHTML, /Accept analytics/); assert.match(b.panel.innerHTML, /https:\/\/lexie.test\/en\/privacy\//);
  const redirected = browser({ saved: record(true), redirect: true }); redirected.ready();
  assert.equal(redirected.requests.length, 0); assert.equal(redirected.panel, undefined);
});
