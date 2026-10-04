import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PUBLIC_PAGES, translatePage, normalize } from "../scripts/build-languages.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const translations = JSON.parse(await read("data/translations/en.json"));

test("all English pages are current and retain matching language links", async () => {
  for (const page of PUBLIC_PAGES) {
    const source = await read(page);
    const english = await read(`en/${page}`);
    assert.equal(english, translatePage(source, page, translations), `${page}: regenerate the English pages`);
    assert.match(source, /assets\/js\/language\.js/);
    assert.match(english, /<html\b[^>]*lang="en"/);
    assert.match(english, /data-language-choice="en"[^>]*aria-current="true"/);
    assert.doesNotMatch(english, /data-language-choice="pl"[^>]*aria-current="true"/);
    assert.match(english, /hreflang="pl"/);
    assert.match(english, /hreflang="en"/);
    assert.match(english, /hreflang="x-default"/);
    assert.match(english, /\/en\/(?:[^" ]*)"[^>]*(?:rel="canonical")|rel="canonical"[^>]*\/en\//);
    assert(english.indexOf("language.js") < english.indexOf("theme.js"));
  }
});

test("responsive images and nested-page assets resolve outside the language folder", async () => {
  const home = await read("en/index.html");
  assert.match(home, /srcset="\s*\.\.\/assets\/img\/hero-380.webp/);
  const nested = await read("en/faq/zapisy-i-ceny/index.html");
  assert.match(nested, /src="\.\.\/\.\.\/\.\.\/assets\/js\/language.js/);
  assert.match(nested, /href="\.\.\/\.\.\/\.\.\/faq\/zapisy-i-ceny\/\?lang=pl"/);
});

test("all current reviews and portfolio descriptions have complete English translations", async () => {
  for (const file of ["data/reviews.json", "data/portfolio.json"]) {
    const { items } = JSON.parse(await read(file));
    for (const item of items) {
      const text = item.content || item.alt;
      if (text) assert(translations[normalize(text)], `${file}: missing translation for ${item.id}`);
    }
  }
});

test("structured data is English and studio identity remains consistent", async () => {
  for (const page of PUBLIC_PAGES) {
    const html = await read(`en/${page}`);
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(json);
      const check = value => {
        if (Array.isArray(value)) return value.forEach(check);
        if (!value || typeof value !== "object") return;
        if (value.inLanguage) assert.equal(value.inLanguage, "en-GB");
        if (value["@type"] === "TattooParlor") assert.equal(value["@id"], "https://lexietattoo.pl/#tattoo-parlor");
        if (["WebPage", "CollectionPage", "AboutPage", "WebSite"].includes(value["@type"])) assert.match(value.url, /^https:\/\/lexietattoo\.pl\/en\//);
        Object.values(value).forEach(check);
      };
      check(data);
    }
  }
  const terms = await read("en/terms_of_service/index.html");
  assert.doesNotMatch(terms, /id="regulamin-en"/);
  assert.match(terms, /14 days/);
});

test("generator rejects untranslated new public copy rather than silently publishing Polish text", () => {
  assert.throws(() => translatePage('<html lang="pl"><body>Nowa treść</body></html>', "index.html", translations), /Missing English translations.*index.html:[\s\S]*Nowa treść/);
});

test("sitemap includes both versions of every indexed public page", async () => {
  const sitemap = await read("sitemap.xml");
  assert.equal([...sitemap.matchAll(/<loc>/g)].length, (PUBLIC_PAGES.length - 1) * 2);
  assert.doesNotMatch(sitemap, /404.html/);
});

const { runInNewContext } = await import("node:vm");
const bootstrap = await read("assets/js/language.js");
function chooseLanguage({ language = "pl-PL", current = "pl", saved = null, search = "", hash = "", disabledStorage = false } = {}) {
  let redirected = null;
  const storage = new Map(saved ? [["lexie-language", saved]] : []);
  const context = {
    URL,
    navigator: { languages: [language], language },
    document: { currentScript: { src: "https://example.test/site/assets/js/language.js" }, documentElement: { lang: current, dataset: { pagePath: "faq/zapisy-i-ceny/" } }, addEventListener() {} },
    location: { href: `https://example.test/site/${current === "en" ? "en/" : ""}faq/zapisy-i-ceny/${search}${hash}`, replace(url) { redirected = url; } },
    localStorage: { getItem(key) { if (disabledStorage) throw Error("Storage disabled"); return storage.get(key); }, setItem(key, value) { if (disabledStorage) throw Error("Storage disabled"); storage.set(key, value); } },
  };
  runInNewContext(bootstrap, context);
  return { redirected, stored: storage.get("lexie-language") };
}

test("initial language follows the system and routes exact subpages including query and hash", () => {
  assert.equal(chooseLanguage({ language: "pl-PL" }).redirected, null);
  assert.equal(chooseLanguage({ language: "en-US", search: "?source=instagram", hash: "#zadatek" }).redirected, "https://example.test/site/en/faq/zapisy-i-ceny/?source=instagram#zadatek");
  assert.match(chooseLanguage({ language: "de-DE" }).redirected, /\/en\/faq\/zapisy-i-ceny\/$/);
  assert.equal(chooseLanguage({ current: "en", language: "pl-PL" }).redirected, null);
});

test("manual language overrides the system, and explicit URLs work without storage", () => {
  assert.equal(chooseLanguage({ saved: "pl", language: "en-US" }).redirected, null);
  assert.match(chooseLanguage({ saved: "en", language: "pl-PL" }).redirected, /\/en\//);
  const explicit = chooseLanguage({ current: "en", language: "en-US", search: "?lang=pl", disabledStorage: true });
  assert.equal(explicit.redirected, "https://example.test/site/faq/zapisy-i-ceny/?lang=pl");
  assert.equal(chooseLanguage({ language: "pl-PL", search: "?lang=en" }).stored, "en");
  assert.match(chooseLanguage({ saved: "invalid", language: "en-US" }).redirected, /\/en\//);
});
