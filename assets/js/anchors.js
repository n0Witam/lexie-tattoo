// Keep fragment navigation aligned while late content and viewport changes settle.
export function setupAnchorNavigation(contentReady) {
  const pageLoaded = document.readyState === "complete"
    ? Promise.resolve()
    : new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
  const layoutReady = Promise.all([contentReady, document.fonts.ready, pageLoaded]);
  let pending = null;

  const findTarget = (hash) => {
    try {
      return document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch {
      return null;
    }
  };

  const scrollToHash = async () => {
    pending?.abort();
    pending = null;
    const hash = window.location.hash;
    const target = hash && findTarget(hash);
    if (!target) return;

    const controller = new AbortController();
    pending = controller;
    const cancel = () => controller.abort();
    const options = { passive: true, signal: controller.signal };
    // Only real interaction cancels alignment; programmatic scrolling does not.
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown", "pagehide"]) {
      window.addEventListener(event, cancel, options);
    }

    let frame = 0;
    let observer;
    controller.signal.addEventListener("abort", () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (pending === controller) pending = null;
    }, { once: true });

    try {
      await layoutReady;
      // Let carousel initialization finish its deferred layout work.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (controller.signal.aborted || window.location.hash !== hash) return;

      const header = document.querySelector(".site-header");
      const align = () => {
        if (controller.signal.aborted || !target.isConnected) return;
        const headerTop = header ? parseFloat(getComputedStyle(header).top) || 0 : 0;
        const headerHeight = header?.getBoundingClientRect().height || 0;
        const viewportTop = window.visualViewport?.offsetTop || 0;
        const offset = viewportTop + headerTop + headerHeight + 8;
        const requestedTop = window.scrollY + target.getBoundingClientRect().top - offset;
        const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const top = Math.max(0, Math.min(requestedTop, maxTop));
        if (Math.abs(window.scrollY - top) > 1) {
          // An exact page coordinate avoids competing native/smooth fragment scrolls.
          window.scrollTo({ top, left: window.scrollX, behavior: "instant" });
        }
      };
      const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(align);
      };

      // Watch late image/widget reflows and changes when mobile browser bars move.
      // Stop as soon as the user interacts, rather than keeping them at the anchor.
      observer = new ResizeObserver(schedule);
      for (const element of document.querySelectorAll("body, .site-header, main, main > section")) {
        observer.observe(element);
      }
      window.addEventListener("resize", schedule, options);
      window.addEventListener("scrollend", schedule, options);
      window.visualViewport?.addEventListener("resize", schedule, options);
      document.fonts.addEventListener("loadingdone", schedule, options);
      align();
    } catch (error) {
      cancel();
      console.warn("Could not align the section link:", error);
    }
  };

  // Own same-page links so the browser and this helper do not start two scrolls.
  // This also handles clicking the current fragment again (no hashchange event).
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
    if (!url.hash || !findTarget(url.hash)) return;

    event.preventDefault();
    if (url.hash !== location.hash) history.pushState(null, "", url.href);
    void scrollToHash();
  });

  window.addEventListener("hashchange", () => void scrollToHash());
  void scrollToHash();
}
