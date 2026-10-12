// Keep desktop scrolling and the artwork's depth in the same animation frame.
// Native smooth scrolling can run ahead of scroll events in Safari's compositor.
export function createCarouselScroller(track, {
  onUpdate = () => {},
  duration = 420,
  now = () => performance.now(),
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
} = {}) {
  let frame = 0;
  let snap = null;

  const suspendSnap = () => {
    if (!snap) {
      snap = [track.style.getPropertyValue("scroll-snap-type"),
        track.style.getPropertyPriority("scroll-snap-type")];
      track.style.setProperty("scroll-snap-type", "none");
    }
  };
  const restoreSnap = () => {
    if (!snap) return;
    if (snap[0]) track.style.setProperty("scroll-snap-type", ...snap);
    else track.style.removeProperty("scroll-snap-type");
    snap = null;
  };
  const write = left => {
    track.scrollTo({ left, top: 0, behavior: "instant" });
    onUpdate();
  };

  return {
    scrollTo(left, behavior = "smooth") {
      cancelFrame(frame);
      frame = 0;
      suspendSnap();
      const start = track.scrollLeft;
      const started = now();
      if (behavior !== "smooth" || Math.abs(left - start) < 0.5) {
        write(left);
        restoreSnap();
        return;
      }
      const tick = time => {
        const progress = Math.min(1, Math.max(0, (time - started) / duration));
        write(start + (left - start) * (1 - (1 - progress) ** 3));
        if (progress < 1) frame = requestFrame(tick);
        else {
          frame = 0;
          restoreSnap();
        }
      };
      frame = requestFrame(tick);
    },
    cancel() {
      cancelFrame(frame);
      frame = 0;
      restoreSnap();
    },
  };
}
