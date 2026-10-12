// Keep desktop scrolling and the artwork's depth in the same animation frame.
// The track uses script-controlled snapping throughout, so Safari does not
// rebuild its composited scroll layers when an animation finishes.
export function createCarouselScroller(track, {
  onUpdate = () => {},
  duration = 420,
  now = () => performance.now(),
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
} = {}) {
  let frame = 0;
  const write = left => {
    track.scrollTo({ left, top: 0, behavior: "instant" });
    onUpdate();
  };

  return {
    get isAnimating() { return frame !== 0; },
    scrollTo(left, behavior = "smooth") {
      cancelFrame(frame);
      frame = 0;
      const start = track.scrollLeft;
      const started = now();
      if (behavior !== "smooth" || Math.abs(left - start) < 0.5) {
        write(left);
        return;
      }
      const tick = () => {
        // A busy WebKit frame may carry an old RAF timestamp. Use the same
        // monotonic clock as the start, so delayed frames still finish on time.
        const progress = Math.min(1, Math.max(0, (now() - started) / duration));
        write(start + (left - start) * (1 - (1 - progress) ** 3));
        if (progress < 1) frame = requestFrame(tick);
        else {
          frame = 0;
        }
      };
      frame = requestFrame(tick);
    },
    cancel() {
      cancelFrame(frame);
      frame = 0;
    },
  };
}
