// A single clock drives both the slide change and its visual countdown.
export function createCarouselAutoplay({
  duration, onAdvance, onProgress,
  now = () => performance.now(),
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
}) {
  let running = false, frame = null, elapsed = 0, previous = 0;
  const pauses = new Set();
  const enabled = Number.isFinite(duration) && duration > 0;
  const publish = () => onProgress(enabled ? Math.min(1, elapsed / duration) : 0);
  const accumulate = () => {
    const current = now();
    elapsed += Math.max(0, current - previous);
    previous = current;
  };
  const schedule = () => {
    if (running && !pauses.size && frame === null) frame = requestFrame(tick);
  };
  function tick() {
    frame = null;
    if (!running || pauses.size) return;
    accumulate();
    if (elapsed >= duration) {
      elapsed = 0;
      onAdvance();
    }
    publish();
    schedule();
  }
  return {
    start() {
      if (running || !enabled) return;
      running = true; previous = now(); publish(); schedule();
    },
    reset() { elapsed = 0; previous = now(); publish(); },
    pause(reason) {
      if (pauses.has(reason)) return;
      if (running && !pauses.size) accumulate();
      pauses.add(reason);
      if (frame !== null) cancelFrame(frame);
      frame = null; publish();
    },
    resume(reason) {
      if (!pauses.delete(reason) || pauses.size) return;
      previous = now(); schedule();
    },
    stop() {
      running = false;
      if (frame !== null) cancelFrame(frame);
      frame = null;
    },
  };
}
