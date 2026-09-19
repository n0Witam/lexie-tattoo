// Loaded before the stylesheet to apply a saved theme before the first paint.
(() => {
  const storageKey = "lexie-theme";
  const systemTheme = window.matchMedia("(prefers-color-scheme: light)");
  const validTheme = (value) => value === "light" || value === "dark" ? value : null;
  let preference = null;
  try {
    preference = validTheme(localStorage.getItem(storageKey));
  } catch {
    // Theme switching still works when browser storage is unavailable.
  }

  const applyTheme = () => {
    const theme = preference || (systemTheme.matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.content = theme === "light" ? "#ece2d5" : "#3d352c";
    });
    document.querySelectorAll("[data-theme-controls]").forEach((controls) => {
      controls.hidden = false;
      const button = controls.querySelector("[data-theme-toggle]");
      button.querySelector("[data-theme-label]").textContent =
        theme === "light" ? "Włącz ciemny motyw" : "Włącz jasny motyw";
      controls.querySelector("[data-theme-reset]").hidden = preference === null;
    });
  };

  const chooseTheme = (theme) => {
    preference = theme;
    try {
      if (theme) localStorage.setItem(storageKey, theme);
      else localStorage.removeItem(storageKey);
    } catch {
      // Keep the choice for this page even if it cannot be persisted.
    }
    applyTheme();
  };

  applyTheme();
  systemTheme.addEventListener("change", () => {
    if (preference === null) applyTheme();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = validTheme(event.newValue);
    applyTheme();
  });

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme();
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        chooseTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
      });
    });
    document.querySelectorAll("[data-theme-reset]").forEach((button) => {
      button.addEventListener("click", () => {
        chooseTheme(null);
        button.parentElement.querySelector("[data-theme-toggle]").focus();
      });
    });
  });
})();
