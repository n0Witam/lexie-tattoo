// Correct native fragment navigation once asynchronously rendered content is ready.
export function setupAnchorNavigation(contentReady) {
  const pageLoaded = document.readyState === "complete"
    ? Promise.resolve()
    : new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
  const layoutReady = Promise.all([contentReady, document.fonts.ready, pageLoaded]);
  let pending = null;

  const scrollToHash = async (initial = false) => {
    pending?.abort();
    const hash = window.location.hash;
    if (!hash) return;

    let target;
    try {
      target = document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch {
      return;
    }
    if (!target) return;

    const controller = new AbortController();
    pending = controller;
    const cancel = () => controller.abort();
    const options = { passive: true, signal: controller.signal };
    // Never pull the user back after they have chosen to scroll or interact.
    for (const event of ["wheel", "touchstart", "pointerdown"]) {
      window.addEventListener(event, cancel, options);
    }
    window.addEventListener("keydown", cancel, options);

    try {
      await layoutReady;
      // Carousel setup schedules layout work over two animation frames.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (controller.signal.aborted || window.location.hash !== hash) return;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({
        behavior: initial || reducedMotion ? "instant" : "smooth",
        block: "start",
      });
    } finally {
      controller.abort();
      if (pending === controller) pending = null;
    }
  };

  window.addEventListener("hashchange", () => void scrollToHash());
  void scrollToHash(true);
}
