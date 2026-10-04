import { EN } from "./locales/en.js?v=20261004-pl-en";

export const getLanguage = () => document.documentElement.lang === "en" ? "en" : "pl";
export const normalizeTranslationKey = value => String(value ?? "").replace(/\s+/g, " ").trim();

export function t(value, params = {}) {
  value = value ?? "";
  const translated = getLanguage() === "en" ? EN[normalizeTranslationKey(value)] ?? value : value;
  return String(translated).replace(/\{(\w+)\}/g, (match, key) => params[key] ?? match);
}

// Only used for our dynamically created booking dialog, never user-entered text.
export function localizeElement(root) {
  if (getLanguage() !== "en") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest("script, style")) continue;
    if (EN[normalizeTranslationKey(node.textContent)] !== undefined) node.textContent = t(node.textContent);
  }
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of ["alt", "aria-label", "placeholder", "title"]) {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, t(element.getAttribute(attribute)));
    }
  }
}
