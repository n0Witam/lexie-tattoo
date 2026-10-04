// Runs before CSS: choose a translated document before the first paint.
(() => {
  const key = "lexie-language";
  const valid = value => value === "pl" || value === "en" ? value : null;
  const base = new URL("../../", document.currentScript.src);
  const current = document.documentElement.lang === "en" ? "en" : "pl";
  const url = new URL(location.href);
  const requested = valid(url.searchParams.get("lang"));
  let saved = null;
  try {
    saved = valid(localStorage.getItem(key));
    if (requested) localStorage.setItem(key, requested);
  } catch { /* Explicit language links work even without browser storage. */ }
  const system = navigator.languages?.[0] || navigator.language || "pl";
  // A direct English URL is an explicit choice; Polish entry URLs follow the OS.
  const preferred = requested || saved || (current === "en" ? "en" : /^pl(?:-|$)/i.test(system) ? "pl" : "en");
  const route = document.documentElement.dataset.pagePath || "";
  if (preferred !== current) {
    const destination = new URL((preferred === "en" ? "en/" : "") + route, base);
    destination.search = url.search;
    destination.hash = url.hash;
    location.replace(destination.href);
    return;
  }
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-language-choice]").forEach(link => {
      const language = link.dataset.languageChoice;
      const destination = new URL((language === "en" ? "en/" : "") + route, base);
      destination.search = location.search;
      destination.searchParams.set("lang", language);
      destination.hash = location.hash;
      link.href = destination.href;
      link.addEventListener("click", () => {
        try { localStorage.setItem(key, language); } catch { /* URL carries choice. */ }
      });
    });
    // Carry explicit choices across navigation when storage is unavailable.
    if (requested) document.querySelectorAll("a[href]:not([data-language-choice])").forEach(link => {
      const destination = new URL(link.href);
      if (destination.origin !== base.origin || !destination.pathname.startsWith(base.pathname)) return;
      if (/\.[a-z0-9]+$/i.test(destination.pathname) && !destination.pathname.endsWith(".html")) return;
      destination.searchParams.set("lang", current);
      link.href = destination.href;
    });
  });
})();
