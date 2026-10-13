// Basic consent mode: no Google container, tags, or pings before opt-in.
// Loaded synchronously in the head, after language selection.
(() => {
  if (document.documentElement.dataset.languageRedirecting === "true") return;
  const containerId = "GTM-5245GRKX";
  const measurementId = "G-H3EH3ETSMH";
  const storageKey = "lexie-consent";
  const version = 1;
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const base = new URL("../../", document.currentScript.src);
  const language = document.documentElement.lang === "en" ? "en" : "pl";
  const copy = language === "en" ? {
    title: "Your privacy",
    description: "With your permission, we use Google Analytics cookies to understand visits to this website. Google receives data about your device and activity. Rejecting analytics does not affect the website or contact forms.",
    accept: "Accept analytics", reject: "Reject analytics", policy: "Privacy and cookies",
    enabled: "Analytics is currently enabled.", disabled: "Analytics is currently disabled.",
    close: "Close settings",
  } : {
    title: "Twoja prywatność",
    description: "Za Twoją zgodą używamy cookies Google Analytics, aby analizować ruch na stronie. Google otrzymuje dane o urządzeniu i aktywności. Odrzucenie analityki nie ogranicza strony ani formularzy kontaktowych.",
    accept: "Akceptuję analitykę", reject: "Odrzucam analitykę", policy: "Prywatność i cookies",
    enabled: "Analityka jest obecnie włączona.", disabled: "Analityka jest obecnie wyłączona.",
    close: "Zamknij ustawienia",
  };

  const parseChoice = raw => {
    try {
      const value = JSON.parse(raw);
      const now = Date.now();
      return value?.version === version && typeof value.analytics === "boolean"
        && Number.isFinite(value.savedAt) && value.savedAt <= now
        && value.expiresAt === value.savedAt + lifetime && value.expiresAt > now ? value : null;
    } catch { return null; }
  };
  const readChoice = () => {
    try { return parseChoice(localStorage.getItem(storageKey)); } catch { return null; }
  };
  const consentState = analytics => ({
    analytics_storage: analytics ? "granted" : "denied",
    ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
  });
  function command() { window.dataLayer.push(arguments); }
  let choice = readChoice();
  let loaded = false;
  let panel;
  let opener;
  let expiryTimer;

  window.lexieConsent = Object.freeze({
    hasAnalyticsConsent: () => choice?.analytics === true && choice.expiresAt > Date.now(),
  });

  window.dataLayer = window.dataLayer || [];
  window[`ga-disable-${measurementId}`] = choice?.analytics !== true;
  // These commands are queued before gtm.js can run. No tag is loaded yet.
  command("consent", "default", consentState(choice?.analytics === true));
  command("set", "ads_data_redaction", true);

  function clearAnalyticsCookies() {
    const names = document.cookie.split(";").map(cookie => cookie.trim().split("=")[0])
      .filter(name => /^_ga(?:_|$)/.test(name));
    const domains = [""];
    const hostname = location.hostname.split(".");
    for (let i = 0; i < hostname.length - 1; i++) {
      const domain = hostname.slice(i).join(".");
      domains.push(`; domain=${domain}`, `; domain=.${domain}`);
    }
    const paths = new Set(["/"]);
    const segments = location.pathname.split("/");
    for (let i = 1; i < segments.length; i++) {
      const path = segments.slice(0, i).join("/") || "/";
      paths.add(path); paths.add(path.endsWith("/") ? path : `${path}/`);
    }
    for (const name of names) for (const domain of domains) for (const path of paths) {
      document.cookie = `${name}=; Max-Age=0; path=${path}${domain}; SameSite=Lax`;
    }
  }

  function loadContainer() {
    if (loaded || choice?.analytics !== true) return;
    loaded = true;
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${containerId}`;
    document.head.appendChild(script);
  }

  function closePanel() {
    panel.hidden = true;
    document.querySelectorAll("[data-cookie-settings]").forEach(button => button.setAttribute("aria-expanded", "false"));
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }

  function showPanel(button) {
    if (!panel) return;
    opener = button || null;
    panel.querySelector("[data-consent-state]").textContent = choice
      ? choice.analytics ? copy.enabled : copy.disabled : "";
    panel.querySelector("[data-consent-close]").hidden = !choice;
    panel.hidden = false;
    document.querySelectorAll("[data-cookie-settings]").forEach(button => button.setAttribute("aria-expanded", "true"));
    // Initial notice leaves keyboard focus and page scrolling alone.
    if (button) panel.querySelector("[data-consent-reject]").focus({ preventScroll: true });
  }

  function scheduleExpiry() {
    window.clearTimeout(expiryTimer);
    if (!choice) return;
    expiryTimer = window.setTimeout(() => {
      if (choice.expiresAt <= Date.now()) applyChoice(null);
      else scheduleExpiry();
    }, Math.min(choice.expiresAt - Date.now(), 2147483647));
  }

  function applyChoice(next) {
    choice = next;
    window[`ga-disable-${measurementId}`] = choice?.analytics !== true;
    if (choice?.analytics === true) {
      command("consent", "update", consentState(true));
      loadContainer();
    } else {
      clearAnalyticsCookies();
      if (loaded) {
        // Removing a script cannot undo a running container. Reload into a
        // denied state so it cannot keep sending even cookieless requests.
        command("consent", "update", consentState(false));
        location.reload();
        return;
      }
    }
    scheduleExpiry();
    if (!choice) showPanel();
  }

  function choose(analytics) {
    const savedAt = Date.now();
    const next = { version, analytics, savedAt, expiresAt: savedAt + lifetime };
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // A quota failure must not leave a previous opt-in after withdrawal.
      try { localStorage.removeItem(storageKey); } catch { /* Storage unavailable. */ }
    }
    closePanel();
    applyChoice(next);
  }

  if (choice?.analytics === true) loadContainer();
  else clearAnalyticsCookies();
  scheduleExpiry();

  function synchronizeChoice() {
    let next;
    try { next = parseChoice(localStorage.getItem(storageKey)); } catch { return; }
    if (next?.savedAt === choice?.savedAt && next?.analytics === choice?.analytics) return;
    if (panel && next) closePanel();
    applyChoice(next);
  }
  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) synchronizeChoice();
  });
  window.addEventListener("focus", synchronizeChoice);
  window.addEventListener("pageshow", synchronizeChoice);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") synchronizeChoice();
  });

  document.addEventListener("DOMContentLoaded", () => {
    const policy = new URL(`${language === "en" ? "en/" : ""}privacy/`, base);
    panel = document.createElement("section");
    panel.id = "cookie-settings";
    panel.className = "consent-panel";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-labelledby", "consent-title");
    panel.hidden = true;
    panel.innerHTML = `<div class="consent-panel__copy">
      <h2 id="consent-title">${copy.title}</h2>
      <p>${copy.description}</p>
      <a class="consent-panel__policy" href="${policy.href}">${copy.policy}</a>
      <p class="consent-panel__state" data-consent-state></p>
    </div>
    <div class="consent-panel__actions">
      <button class="btn" type="button" data-consent-reject>${copy.reject}</button>
      <button class="btn" type="button" data-consent-accept>${copy.accept}</button>
      <button class="consent-panel__close" type="button" data-consent-close>${copy.close}</button>
    </div>`;
    document.body.appendChild(panel);
    panel.querySelector("[data-consent-reject]").addEventListener("click", () => choose(false));
    panel.querySelector("[data-consent-accept]").addEventListener("click", () => choose(true));
    panel.querySelector("[data-consent-close]").addEventListener("click", closePanel);
    panel.addEventListener("keydown", event => { if (event.key === "Escape" && choice) closePanel(); });
    document.querySelectorAll("[data-cookie-settings]").forEach(button => {
      button.hidden = false;
      button.setAttribute("aria-controls", panel.id);
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", () => showPanel(button));
    });
    if (!choice) showPanel();
  });
})();
