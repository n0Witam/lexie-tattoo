import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_PAGES = ["index.html", "portfolio/index.html", "available_designs/index.html", "about/index.html", "faq/index.html", "faq/zapisy-i-ceny/index.html", "faq/projekt-i-sesja/index.html", "faq/przygotowanie/index.html", "faq/gojenie-i-pielegnacja/index.html", "terms_of_service/index.html", "404.html"];
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ENTITIES = { amp: "&", quot: '"', apos: "'", nbsp: "\u00a0", lt: "<", gt: ">" };
export const decode = value => value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|nbsp|lt|gt);/gi, (match, entity) => entity[0] === "#" ? String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase() === "x" ? 2 : 1), entity[1].toLowerCase() === "x" ? 16 : 10)) : ENTITIES[entity.toLowerCase()]);
export const normalize = value => decode(value).replace(/\s+/g, " ").trim();
const escapeText = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = value => escapeText(value).replace(/"/g, "&quot;");
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)].map(match => [match[1], decode(match[3] ?? match[4])]));

export function translatePage(source, page, translations) {
  const missing = new Set();
  const translate = text => {
    const key = normalize(text);
    if (!key || !/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(key)) return text;
    if (translations[key] === undefined) { missing.add(key); return text; }
    return translations[key];
  };
  // The Polish terms contain a second, legacy English translation. Use the
  // complete translation of the current Polish rules in the English document.
  if (page === "terms_of_service/index.html") source = source.replace(/\s*<details\b[^>]*id="regulamin-en"[\s\S]*?<\/details>/, "");
  source = source.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, json) => {
    const localize = (value, key = "") => {
      if (Array.isArray(value)) return value.map(item => localize(item, key));
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localize(v, k)]));
      if (typeof value !== "string") return value;
      if (key === "inLanguage") return "en-GB";
      // Keep the physical studio's identity, address and asset URLs unchanged.
      if (/^https:\/\/lexietattoo\.pl\//.test(value) && !/\/(assets|data)\//.test(value) && !value.endsWith("#tattoo-parlor")) return value.replace("https://lexietattoo.pl/", "https://lexietattoo.pl/en/");
      return ["name", "description", "text", "headline"].includes(key) ? translate(value) : value;
    };
    return `<script type="application/ld+json">${JSON.stringify(localize(JSON.parse(json)), null, 4)}</script>`;
  });
  let rawTag = null;
  const route = page === "index.html" ? "" : page.replace(/index\.html$/, "");
  const rootPrefix = "../".repeat(page.split("/").length);
  const tokens = source.match(/<!--[\s\S]*?-->|<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g) || [];
  const html = tokens.map(token => {
    if (token.startsWith("<!--")) return token;
    if (!token.startsWith("<")) {
      if (rawTag) return rawTag === "script" ? token.replace(/(["'])(\.\/?(?:\.\.\/)*assets\/[^"']+)\1/g, (_, quote, path) => quote + "../" + path.replace(/^\.\//, "") + quote) : token;
      const translated = translate(token);
      return translated === token ? token : token.replace(/\S[\s\S]*\S|\S/, escapeText(translated));
    }
    const closing = /^<\//.test(token);
    const name = token.match(/^<\/?([\w-]+)/)?.[1]?.toLowerCase();
    if (closing && name === rawTag) { rawTag = null; return token; }
    if (!closing && (name === "script" || name === "style")) rawTag = name;
    const attrs = attributes(token);
    return token.replace(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (match, key, quoted, double, single) => {
      let value = decode(double ?? single);
      if (attrs["data-language-choice"] && key === "href") value = `${rootPrefix}${attrs["data-language-choice"] === "en" ? "en/" : ""}${route}?lang=${attrs["data-language-choice"]}`;
      else if (attrs["data-language-choice"] && key === "aria-current") return "";
      else if (key === "lang" && name === "html") value = "en";
      else if (["alt", "aria-label", "placeholder", "title"].includes(key)) value = translate(value);
      else if (name === "meta" && key === "content") {
        if (["description", "og:title", "og:description", "twitter:title", "twitter:description"].includes(attrs.name || attrs.property)) value = translate(value);
        if (attrs.property === "og:locale") value = "en_GB";
        if (attrs.property === "og:url") value = value.replace("https://lexietattoo.pl/", "https://lexietattoo.pl/en/");
      } else if (key === "href" && attrs.rel === "canonical") value = value.replace("https://lexietattoo.pl/", "https://lexietattoo.pl/en/");
      else if (key === "locale-name") value = "en";
      else if (key === "srcset") value = value.replace(/((?:\.\/)?(?:\.\.\/)*(?:assets|data)\/[^\s,]+)/g, path => "../" + path.replace(/^\.\//, ""));
      else if (["src", "href", "poster"].includes(key) && /^(?:\.\/)?(?:\.\.\/)*(?:assets|data)\//.test(value)) value = "../" + value.replace(/^\.\//, "");
      return `${key}="${escapeAttr(value)}"`;
    }).replace(/(<a\b[^>]*data-language-choice="en"[^>]*)(>)/, '$1 aria-current="true"$2');
  }).join("");
  if (missing.size) throw new Error(`Missing English translations in ${page}:\n${[...missing].join("\n")}`);
  return html;
}

export async function buildLanguages(root = ROOT) {
  const translations = JSON.parse(await readFile(resolve(root, "data/translations/en.json"), "utf8"));
  const output = async (path, content) => { await mkdir(dirname(resolve(root, path)), { recursive: true }); await writeFile(resolve(root, path), content); };
  for (const page of PUBLIC_PAGES) await output(`en/${page}`, translatePage(await readFile(resolve(root, page), "utf8"), page, translations));
  await output("assets/js/locales/en.js", `// Generated by scripts/build-languages.mjs from data/translations/en.json.\nexport const EN = ${JSON.stringify(translations, null, 2)};\n`);
  const urls = PUBLIC_PAGES.filter(page => page !== "404.html").map(page => page.replace(/index\.html$/, ""));
  const origin = "https://lexietattoo.pl/";
  const sitemap = urls.flatMap(route => ["", "en/"].map(prefix => `  <url>\n    <loc>${origin}${prefix}${route}</loc>\n    <xhtml:link rel="alternate" hreflang="pl" href="${origin}${route}" />\n    <xhtml:link rel="alternate" hreflang="en" href="${origin}en/${route}" />\n    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}${route}" />\n  </url>`)).join("\n");
  await output("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemap}\n</urlset>\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildLanguages();
  console.log("English pages, runtime translations and bilingual sitemap generated.");
}
