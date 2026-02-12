import { qs, qsa } from "./util.js";

function setYear() {
  const year = new Date().getFullYear();
  const el = qs("[data-year]");
  if (el) el.textContent = String(year);
}

function setupFAQ(root) {
  const items = qsa("[data-faq-item]", root);
  if (!items.length) return;

  const closeItem = (item) => {
    const btn = qs(".faq__q", item);
    const panel = qs("[data-faq-panel]", item);
    if (!btn || !panel) return;

    btn.setAttribute("aria-expanded", "false");
    item.classList.remove("is-open");
    panel.style.maxHeight = "0px";
  };

  const openItem = (item) => {
    const btn = qs(".faq__q", item);
    const panel = qs("[data-faq-panel]", item);
    if (!btn || !panel) return;

    btn.setAttribute("aria-expanded", "true");
    item.classList.add("is-open");
    panel.style.maxHeight = panel.scrollHeight + "px";
  };

  const closeAll = (except = null) => {
    items.forEach((it) => {
      if (except && it === except) return;
      closeItem(it);
    });
  };

  // Init: pierwszy otwarty
  closeAll();
  openItem(items[0]);

  items.forEach((item) => {
    const btn = qs(".faq__q", item);
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (item.classList.contains("is-open")) return; // zawsze 1 otwarty
      closeAll(item);
      openItem(item);
    });
  });

  window.addEventListener("resize", () => {
    const open = items.find((it) => it.classList.contains("is-open"));
    if (!open) return;
    const panel = qs("[data-faq-panel]", open);
    if (!panel) return;
    panel.style.maxHeight = panel.scrollHeight + "px";
  });
}

window.addEventListener("DOMContentLoaded", () => {
  setYear();
  const root = qs("[data-faq]");
  if (root) setupFAQ(root);
});
