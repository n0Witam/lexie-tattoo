import { t } from "./i18n.js?v=20261013-leads";
import { createCarouselAutoplay } from "./carousel-autoplay.js";
import { createCarouselScroller } from "./carousel-scroll.js?v=20261012-stable-snap";
import { normalizePortfolio } from "./portfolio-data.js";
import { fetchJSON, qs, qsa } from "./util.js";
import { initSite, openFreePatternModal, setupContactForm } from "./site.js?v=20261013-leads";
import { setupAnchorNavigation } from "./anchors.js?v=20260919-section-start";

const DATA_URL = new URL("../../data/portfolio.json", import.meta.url);
const REVIEWS_URL = new URL("../../data/reviews.json", import.meta.url);

function normalizeReviewText(value = "") {
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
}

function escapeHTML(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderStars(rating = 5) {
  const safeRating = Math.max(0, Math.min(5, Number(rating) || 0));
  return Array.from({ length: 5 }, (_, index) => {
    const filled = index < safeRating;
    return `
      <svg
        class="review-card__star${filled ? " is-filled" : ""}"
        viewBox="0 0 20 20"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M10 1.2l2.46 4.98 5.5.8-3.98 3.88.94 5.48L10 13.76l-4.92 2.58.94-5.48L2.04 6.98l5.5-.8L10 1.2z"></path>
      </svg>`;
  }).join("");
}

// Shared dots and playback controls for scrolling artwork and fading reviews.
function createCarouselControls(root, {
  track, count, isReviews = false, onSelect, autoplay, initiallyPaused,
}) {
  const dots = document.createElement("div");
  dots.className = "carousel__dots";
  dots.setAttribute("aria-label", isReviews ? t("Wskaźnik opinii") : t("Wskaźnik slajdów"));
  const buttons = Array.from({ length: count }, (_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "carousel__dot";
    button.setAttribute("aria-label", isReviews
      ? t("Przejdź do opinii {index}", { index: index + 1 })
      : t("Przejdź do slajdu {index}", { index: index + 1 }));
    button.setAttribute("aria-controls", track.id);
    button.addEventListener("click", () => onSelect(index));
    dots.appendChild(button);
    return button;
  });
  const controls = document.createElement("div");
  controls.className = "carousel__controls";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", isReviews
    ? t("Sterowanie karuzelą opinii") : t("Sterowanie karuzelą prac"));
  controls.appendChild(dots);
  if (autoplay) {
    let paused = initiallyPaused;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "carousel__playback";
    toggle.setAttribute("aria-controls", track.id);
    const updateToggle = () => {
      const label = paused ? t("Wznów automatyczne przewijanie") : t("Wstrzymaj automatyczne przewijanie");
      toggle.setAttribute("aria-label", label);
      toggle.title = label;
      toggle.innerHTML = paused
        ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5.5 19 12 9 18.5Z" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6v12M15 6v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    };
    toggle.addEventListener("click", () => {
      paused = !paused;
      if (paused) autoplay.pause("manual");
      else {
        autoplay.resume("manual");
        autoplay.start();
        root.classList.add("has-autoplay");
      }
      updateToggle();
    });
    updateToggle();
    controls.appendChild(toggle);
  }
  root.appendChild(controls);
  return index => buttons.forEach((button, position) => {
    const active = position === index;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "true" : "false");
  });
}

// Pages overlap in one grid cell. All pages contribute to its height, so
// long opinions never get clipped and a change cannot move the controls.
function setupReviewFade(root, track) {
  const originals = qsa(".review-card", track);
  const count = originals.length;
  if (!count) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let active = 0;
  let requested = 0;
  let transitioning = false;
  const pages = originals.map(card => {
    const page = document.createElement("div");
    page.className = "reviews__page";
    page.appendChild(card);
    page.setAttribute("aria-hidden", "true");
    page.inert = true;
    return page;
  });
  track.replaceChildren(...pages);
  const duration = Number(root.dataset.autoplay || 6500);
  const available = count > 1 && Number.isFinite(duration) && duration > 0;
  const autoplay = createCarouselAutoplay({
    duration: available ? duration : 0,
    onAdvance: () => show(active + 1),
    onProgress: progress => root.style.setProperty("--autoplay-progress", progress.toFixed(4)),
  });
  const updateDots = createCarouselControls(root, {
    track, count, isReviews: true, onSelect: index => show(index),
    autoplay: available ? autoplay : null, initiallyPaused: reduced,
  });
  function select(index) {
    active = index;
    pages.forEach((page, position) => {
      const selected = position === active;
      page.classList.toggle("is-active", selected);
      page.setAttribute("aria-hidden", selected ? "false" : "true");
      page.inert = !selected;
    });
    updateDots(active);
  }
  async function fade(page, from, to) {
    if (reduced) return;
    const animation = page.animate([{ opacity: from }, { opacity: to }], {
      duration: 450, easing: "ease-in-out", fill: "forwards",
    });
    await animation.finished;
    animation.cancel();
  }
  async function show(index) {
    requested = (index + count) % count;
    if (transitioning || requested === active) return;
    transitioning = true;
    autoplay.pause("transition");
    autoplay.reset();
    try {
      // Finish hiding the current opinion before revealing the next one.
      // Rapid clicks update the destination without stacking animations.
      while (requested !== active) {
        await fade(pages[active], 1, 0);
        select(requested);
        await fade(pages[active], 0, 1);
      }
    } finally {
      transitioning = false;
      autoplay.reset();
      autoplay.resume("transition");
    }
  }
  select(0);
  root.classList.toggle("has-autoplay", available && !reduced);
  if (reduced) autoplay.pause("manual");
  if (available && !reduced) autoplay.start();
  const syncVisibility = () => document.hidden
    ? autoplay.pause("hidden") : autoplay.resume("hidden");
  document.addEventListener("visibilitychange", syncVisibility);
  syncVisibility();
  // A horizontal swipe selects the next review without moving the page.
  // Vertical gestures retain normal page scrolling.
  let gesture = null;
  track.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
    autoplay.pause("pointer");
  }, { passive: true });
  window.addEventListener("pointerup", event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(requested + (dx < 0 ? 1 : -1));
    gesture = null;
    autoplay.resume("pointer");
  }, { passive: true });
  window.addEventListener("pointercancel", () => {
    gesture = null;
    autoplay.resume("pointer");
  }, { passive: true });
}

/* ============================================================
   Carousel
   - loop clones
   - click slide (desktop) to center
   - prev/next hit-areas (desktop via CSS)
   - CTA "Chcę ten wzór!" arms after 1s when a FREE slide is centered
   - dots and autoplay progress
   ============================================================ */
function setupCarousel(root) {
  const track = qs("[data-track]", root);
  if (!track) return;

  if (track.dataset.carouselInit === "1") return;
  track.dataset.carouselInit = "1";

  if (track.id === "reviewsTrack") {
    setupReviewFade(root, track);
    return;
  }

  // Anti-save (carousel only)
  track.addEventListener("contextmenu", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG") e.preventDefault();
  });
  track.addEventListener("dragstart", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG") e.preventDefault();
  });

  const slidesAll = () => Array.from(track.querySelectorAll("[data-slide]"));
  const slidesOriginal = () =>
    slidesAll().filter((el) => el.getAttribute("data-clone") !== "1");

  const getStep = () => {
    const slides = slidesAll();
    if (slides.length >= 2) {
      // Preserve fractional pixels when the responsive slide width is not an integer.
      return slides[1].getBoundingClientRect().left - slides[0].getBoundingClientRect().left;
    }
    const first = slides[0];
    return first ? first.getBoundingClientRect().width : 320;
  };

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // ========== Center-snap helpers ==========
  const getTrackCenterX = () => {
    const rT = track.getBoundingClientRect();
    return rT.left + rT.width / 2;
  };

  const getSlideCenterX = (el) => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  };

  const getCenteredIndex = () => {
    const slides = slidesAll();
    if (!slides.length) return 0;

    const cx = getTrackCenterX();
    let best = 0;
    let bestDist = Infinity;

    slides.forEach((el, i) => {
      const d = Math.abs(getSlideCenterX(el) - cx);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });

    return best;
  };

  const getOriginalCenteredIndex = () => {
    const slides = slidesAll();
    if (!slides.length) return 0;

    const cx = getTrackCenterX();
    let bestEl = slides[0];
    let bestDist = Infinity;

    slides.forEach((el) => {
      const d = Math.abs(getSlideCenterX(el) - cx);
      if (d < bestDist) {
        bestDist = d;
        bestEl = el;
      }
    });

    const logicalIndex = Number(bestEl.dataset.logicalIndex);
    return Number.isFinite(logicalIndex) ? logicalIndex : 0;
  };

  let programmaticUntil = 0;
  const markProgrammatic = (ms = 250) => {
    programmaticUntil = performance.now() + ms;
  };
  const isProgrammatic = () => performance.now() < programmaticUntil;
  let updateSlideDepth = null;
  let resetAutoplay = () => {};
  let scheduleSettle = () => {};
  let pointerDown = false;
  const isDesktopPointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;
  const scroller = track.id === "featuredTrack" && isDesktopPointer
    ? createCarouselScroller(track, { onUpdate: () => updateSlideDepth?.() })
    : null;
  const scrollTo = (left, behavior = "auto") => {
    if (scroller) scroller.scrollTo(left, behavior);
    else track.scrollTo({ left, top: 0, behavior });
  };
  if (scroller) {
    track.classList.add("has-scripted-scroll");
    const interruptScroll = () => {
      scroller.cancel();
      programmaticUntil = 0;
      // A trailing wheel event can cancel a snap before its first frame,
      // without causing another scroll event. Always schedule its replacement.
      scheduleSettle();
    };
    track.addEventListener("pointerdown", interruptScroll, { passive: true });
    track.addEventListener("wheel", interruptScroll, { passive: true });
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      scroller.cancel();
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        centerToIndex(getCenteredIndex(), "auto");
      }, 150);
    });
  }

  const centerToIndex = (idx, behavior = "smooth") => {
    const slides = slidesAll();
    if (!slides.length) return;

    idx = Math.max(0, Math.min(slides.length - 1, idx));
    const el = slides[idx];

    const delta = getSlideCenterX(el) - getTrackCenterX();
    markProgrammatic(scroller ? 500 : 300);
    resetAutoplay();
    scrollTo(track.scrollLeft + delta, behavior);
    if (behavior === "auto" && !scroller) updateSlideDepth?.();
  };

  const next = () => {
    const behavior = prefersReduced ? "auto" : "smooth";
    centerToIndex(getCenteredIndex() + 1, behavior);
  };

  const prev = () => {
    const behavior = prefersReduced ? "auto" : "smooth";
    centerToIndex(getCenteredIndex() - 1, behavior);
  };

  if (isDesktopPointer) {
    track.addEventListener("click", (e) => {
      if (e.target.closest(".slide__ctaBtn")) return;
      const slide = e.target.closest("[data-slide]");
      if (!slide) return;
      const slides = slidesAll();
      const idx = slides.indexOf(slide);
      if (idx < 0) return;

      const behavior = prefersReduced ? "auto" : "smooth";
      centerToIndex(idx, behavior);
    });
  }

  track.addEventListener("click", (e) => {
    const button = e.target.closest(".slide__ctaBtn");
    if (!button) return;

    const slide = button.closest("[data-free-pattern='1']");
    if (!slide) return;

    const src = slide.dataset.imageSrc;
    const alt = slide.dataset.imageAlt || t("Wolny wzór Lexie");
    if (!src) return;

    e.preventDefault();
    e.stopPropagation();
    openFreePatternModal(src, alt);
  });

  if (isDesktopPointer && !root.querySelector(".carousel__nav--prev")) {
    const btnPrev = document.createElement("button");
    btnPrev.type = "button";
    btnPrev.className = "carousel__nav carousel__nav--prev";
    btnPrev.setAttribute("aria-label", t("Poprzedni slajd"));
    btnPrev.addEventListener("click", () => prev());

    const btnNext = document.createElement("button");
    btnNext.type = "button";
    btnNext.className = "carousel__nav carousel__nav--next";
    btnNext.setAttribute("aria-label", t("Następny slajd"));
    btnNext.addEventListener("click", () => next());

    root.append(btnPrev, btnNext);
  }

  const isReviews = track.id === "reviewsTrack";
  const shouldRenderDots = track.id === "featuredTrack" || isReviews;

  let updateDots = null;

  const setupDots = () => {
    if (!shouldRenderDots) return;
    if (root.querySelector(".carousel__dots")) return;

    const originals = slidesOriginal();
    if (!originals.length) return;

    const selectDot = createCarouselControls(root, {
      track, count: originals.length, isReviews,
      autoplay: availableAutoplay ? autoplay : null,
      initiallyPaused: manuallyPaused,
      onSelect: index => {
        const target = slidesOriginal()[index];
        if (target) centerToIndex(slidesAll().indexOf(target), prefersReduced ? "auto" : "smooth");
      },
    });

    let rafId = 0;

    updateDots = () => {
      const activeIndex = getOriginalCenteredIndex();

      selectDot(activeIndex);
    };

    const scheduleDotsUpdate = () => {
      if (!updateDots) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateDots);
    };

    track.addEventListener("scroll", scheduleDotsUpdate, { passive: true });
    window.addEventListener("resize", scheduleDotsUpdate);

    requestAnimationFrame(() => {
      if (updateDots) updateDots();
    });
  };

  const setupSlideDepth = () => {
    if (track.id !== "featuredTrack") return;

    const desktopDepth = window.matchMedia(
      "(min-width: 901px) and (hover: hover) and (pointer: fine)",
    );
    let frame = 0;
    updateSlideDepth = () => {
      const center = getTrackCenterX();
      const step = getStep();
      if (step <= 0) return;
      const nearFade = desktopDepth.matches ? 0.14 : 0.28;
      const farFade = desktopDepth.matches ? 0.20 : 0.14;

      // Read stable slide positions before scaling their visual contents.
      // Snap targets and infinite-loop offsets keep their original geometry.
      const positions = slidesAll().map((slide) => ({
        slide,
        offset: (getSlideCenterX(slide) - center) / step,
      }));
      for (const { slide, offset } of positions) {
        const distance = Math.abs(offset);
        const depth = Math.min(prefersReduced ? Math.round(distance) : distance, 2);
        const near = Math.min(depth, 1);
        const far = Math.max(0, depth - 1);
        // Pull outer artwork inward to match the gap beside the central image.
        // Move only the surface, keeping scroll snapping and loop positions stable.
        const extraGap = desktopDepth.matches
          ? 0.12 * Math.min(Math.max(distance - 1, 0), 1) + 0.16 * Math.max(distance - 2, 0)
          : 0;
        const shift = -Math.sign(offset) * extraGap * step;
        slide.style.setProperty("--slide-shift", `${shift.toFixed(3)}px`);
        slide.style.setProperty("--slide-scale", (1 - 0.16 * near - 0.08 * far).toFixed(4));
        slide.style.setProperty("--slide-opacity", (1 - nearFade * near - farFade * far).toFixed(4));
        slide.style.zIndex = String(Math.max(0, 10 - Math.round(distance * 2)));
      }
      track.classList.add("has-slide-depth");
    };
    const schedule = () => {
      if (frame || scroller?.isAnimating) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateSlideDepth();
      });
    };
    track.addEventListener("scroll", schedule, { passive: true });
    desktopDepth.addEventListener("change", schedule);
    new ResizeObserver(schedule).observe(track);
    updateSlideDepth();
  };

  const initLoop = () => {
    if (track.dataset.loopInit === "1") return;

    const slides = slidesAll();
    if (slides.length < 2) return;

    const originalsCount = slides.length;
    const cloneCount = Math.min(3, originalsCount);

    slides.forEach((el, index) => {
      el.dataset.logicalIndex = String(index);
    });

    const headClones = slides.slice(0, cloneCount).map((el, index) => {
      const clone = el.cloneNode(true);
      clone.setAttribute("data-clone", "1");
      clone.dataset.logicalIndex = String(index);
      return clone;
    });

    const tailClones = slides.slice(-cloneCount).map((el, index) => {
      const clone = el.cloneNode(true);
      clone.setAttribute("data-clone", "1");
      clone.dataset.logicalIndex = String(originalsCount - cloneCount + index);
      return clone;
    });

    tailClones.reverse().forEach((c) => track.prepend(c));
    headClones.forEach((c) => track.append(c));

    track.dataset.loopInit = "1";

    requestAnimationFrame(() => {
      const step = getStep();
      scrollTo(cloneCount * step);
      requestAnimationFrame(() => {
        centerToIndex(getCenteredIndex(), "auto");
        if (updateDots) updateDots();
      });
    });

    let lock = false;
    let scrollEndT = null;

    const normalizeLoop = () => {
      if (lock) return;

      if (scroller?.isAnimating || isProgrammatic() || (scroller && pointerDown)) {
        scrollEndT = setTimeout(normalizeLoop, 120);
        return;
      }

      // Desktop wheel/trackpad input settles using the same animation as the
      // buttons. Never toggle native snapping on again after each transition.
      if (scroller) {
        const centered = slidesAll()[getCenteredIndex()];
        // WebKit may round scroll offsets to CSS pixels; do not keep correcting
        // an already centered slide by an unrepresentable fraction of a pixel.
        if (Math.abs(getSlideCenterX(centered) - getTrackCenterX()) > 1) {
          centerToIndex(getCenteredIndex(), prefersReduced ? "auto" : "smooth");
          return;
        }
      }

      const step = getStep();
      const start = cloneCount * step;
      const end = start + originalsCount * step;

      if (track.scrollLeft < start - step * 0.25) {
        lock = true;
        markProgrammatic(350);
        scrollTo(track.scrollLeft + originalsCount * step);
        if (!scroller) updateSlideDepth?.();
        requestAnimationFrame(() => {
          lock = false;
          if (updateDots) updateDots();
        });
      } else if (track.scrollLeft > end - step * 0.25) {
        lock = true;
        markProgrammatic(350);
        scrollTo(track.scrollLeft - originalsCount * step);
        if (!scroller) updateSlideDepth?.();
        requestAnimationFrame(() => {
          lock = false;
          if (updateDots) updateDots();
        });
      }
    };

    const scheduleNormalize = (delay = scroller ? 32 : 140) => {
      window.clearTimeout(scrollEndT);
      if (delay === 0) normalizeLoop();
      else scrollEndT = window.setTimeout(normalizeLoop, delay);
    };
    scheduleSettle = scheduleNormalize;
    track.addEventListener("scroll", () => scheduleNormalize(), { passive: true });
    if (scroller) {
      // Hand off native momentum to centering as soon as the gesture ends.
      // The short quiet-frame fallback also covers older Safari and wheel
      // events that cancel an animation without moving the track.
      track.addEventListener("scrollend", () => scheduleNormalize(0), { passive: true });
    }
  };

  const autoplayMs = Number(root.getAttribute("data-autoplay") || "5000");
  const availableAutoplay = Number.isFinite(autoplayMs) && autoplayMs > 0
    && slidesOriginal().length > 1;
  const enabledAutoplay = availableAutoplay && !prefersReduced;
  let manuallyPaused = prefersReduced;
  const autoplay = createCarouselAutoplay({
    duration: autoplayMs,
    onAdvance: next,
    onProgress: progress => {
      if (shouldRenderDots) root.style.setProperty("--autoplay-progress", progress.toFixed(4));
    },
  });
  resetAutoplay = () => autoplay.reset();
  root.classList.toggle("has-autoplay", enabledAutoplay);

  if (manuallyPaused) autoplay.pause("manual");
  // Controls remain usable while playing. Keyboard focus on slide content
  // pauses movement without overriding the user's explicit pause choice.
  root.addEventListener("focusin", event => {
    if (event.target.closest(".carousel__controls")) autoplay.resume("focus");
    else autoplay.pause("focus");
  });
  root.addEventListener("focusout", event => {
    if (!root.contains(event.relatedTarget) || event.relatedTarget?.closest(".carousel__controls")) {
      autoplay.resume("focus");
    }
  });
  const syncVisibility = () => document.hidden
    ? autoplay.pause("hidden") : autoplay.resume("hidden");
  document.addEventListener("visibilitychange", syncVisibility);
  syncVisibility();

  let userHold = null;
  const pauseOnUser = () => {
    autoplay.pause("interaction");
    autoplay.reset();
    window.clearTimeout(userHold);
    userHold = window.setTimeout(() => autoplay.resume("interaction"), 2000);
  };
  track.addEventListener("pointerdown", () => {
    pointerDown = true;
    autoplay.pause("pointer");
    pauseOnUser();
  }, { passive: true });
  const releasePointer = () => {
    const wasDown = pointerDown;
    pointerDown = false;
    autoplay.resume("pointer");
    if (scroller && wasDown) scheduleSettle(0);
  };
  window.addEventListener("pointerup", releasePointer, { passive: true });
  window.addEventListener("pointercancel", releasePointer, { passive: true });
  track.addEventListener("wheel", pauseOnUser, { passive: true });

  let armT = null;
  let armDebounceT = null;

  const clearArmed = () => {
    slidesAll().forEach((el) => el.classList.remove("is-armed"));
  };

  const armCenteredCta = () => {
    window.clearTimeout(armT);
    clearArmed();

    const slides = slidesAll();
    if (!slides.length) return;

    const centered = slides[getCenteredIndex()];
    if (!centered || centered.dataset.freePattern !== "1") return;

    armT = window.setTimeout(() => {
      const nowSlides = slidesAll();
      const now = nowSlides[getCenteredIndex()];
      if (now === centered && centered.dataset.freePattern === "1") {
        centered.classList.add("is-armed");
      }
    }, 1000);
  };

  const scheduleArmCenteredCta = () => {
    window.clearTimeout(armDebounceT);
    window.clearTimeout(armT);
    clearArmed();
    armDebounceT = window.setTimeout(armCenteredCta, 160);
  };

  track.addEventListener("scroll", scheduleArmCenteredCta, { passive: true });

  initLoop();
  setupDots();
  setupSlideDepth();
  if (enabledAutoplay) autoplay.start();
  window.setTimeout(() => {
    armCenteredCta();
    if (updateDots) updateDots();
  }, 900);
}

/* ============================================================
   Featured carousel render + "Wolny wzór!" badge + CTA button
   ============================================================ */
async function renderFeatured() {
  const carouselTrack = qs("#featuredTrack");
  if (!carouselTrack) return;

  try {
    const { data, url } = await fetchJSON(DATA_URL);

    const normalized = normalizePortfolio(data);
    const items = normalized.items;
    const byId = new Map(items.map((x) => [x.id, x]));

    const groups = normalized.groups;
    const freeGroup = groups.find(
      (g) =>
        String(g?.name || "")
          .trim()
          .toLowerCase() === "wolne wzory",
    );
    const freeIdsRaw = freeGroup && (freeGroup.items || freeGroup.ids);
    const freeIds = Array.isArray(freeIdsRaw) ? freeIdsRaw : [];
    const freeSet = new Set(freeIds);

    const seen = new Set();
    const featuredIds = [];

    const pushIfFeatured = (id) => {
      if (!id || seen.has(id)) return;
      const it = byId.get(id);
      if (!it || !it.featured) return;
      seen.add(id);
      featuredIds.push(id);
    };

    const order = normalized.featuredOrder;
    order.forEach(pushIfFeatured);
    items.forEach((it) => {
      if (it && it.featured) pushIfFeatured(it.id);
    });

    const featured = featuredIds
      .slice(0, 12)
      .map((id) => byId.get(id))
      .filter(Boolean);

    if (featured.length === 0) {
      carouselTrack.innerHTML = "";
      carouselTrack.append(
        t("Brak prac do wyświetlenia — dodaj je w data/portfolio.json."),
      );
      return;
    }

    carouselTrack.innerHTML = "";

    for (const item of featured) {
      const src = new URL(item.src, url).toString();

      const img = document.createElement("img");
      img.alt = t(item.alt) || t("Tatuaż – praca Lexie");
      // This deck contains at most 12 images. Fetch them ahead of navigation;
      // lazy loading is unreliable for artwork pulled into view by transforms.
      img.loading = "eager";
      img.fetchPriority = "low";
      img.decoding = "async";
      if (item.width) img.width = item.width;
      if (item.height) img.height = item.height;
      img.draggable = false;
      img.src = src;

      const fig = document.createElement("figure");
      fig.className = "slide";
      fig.dataset.slide = "1";
      const surface = document.createElement("div");
      surface.className = "slide__surface";
      fig.append(surface);

      if (freeSet.has(item.id)) {
        fig.dataset.freePattern = "1";
        fig.dataset.imageSrc = src;
        fig.dataset.imageAlt = img.alt;

        const badge = document.createElement("div");
        badge.className = "slide__badge";
        badge.textContent = t("Wolny wzór!");
        surface.append(badge);

        const ctaWrap = document.createElement("div");
        ctaWrap.className = "slide__ctaWrap";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slide__ctaBtn btn btn--primary";
        btn.textContent = t("Chcę ten wzór!");

        ctaWrap.append(btn);
        surface.append(ctaWrap);
      }

      surface.append(img);
      carouselTrack.append(fig);
    }
  } catch (err) {
    console.error(err);
    carouselTrack.innerHTML = "";
    carouselTrack.append(
      t("Nie udało się wczytać galerii (sprawdź ścieżki i JSON)."),
    );
  }
}

/* ============================================================
   Reviews fade
   ============================================================ */
async function renderReviews() {
  const track = qs("#reviewsTrack");
  if (!track) return;

  try {
    const { data } = await fetchJSON(REVIEWS_URL);
    const items = Array.isArray(data.items) ? data.items : [];
    const featured = items.filter((item) => item && item.featured !== false);

    if (!featured.length) {
      track.innerHTML =
        `<p class="reviews__empty">${t("Opinie pojawią się wkrótce.")}</p>`;
      return;
    }

    track.innerHTML = featured
      .map((item) => {
        const name = escapeHTML(item.name || t("Anonimowa opinia"));
        const year = item.year
          ? `<span class="review-card__year" style="display: none">${escapeHTML(item.year)}</span>`
          : "";
        const content = escapeHTML(normalizeReviewText(t(item.content))).replace(
          /\n/g,
          "<br>",
        );
        const rating = Number(item.star) || 5;

        return `
          <article class="review-card" aria-label="${escapeHTML(t("Opinia klientki lub klienta od {name}", { name: item.name || t("Anonimowa opinia") }))}">
            <div class="review-card__top">
              <div class="review-card__identity">
                <h3 class="review-card__name">${name}</h3>
                ${year}
              </div>
              <div class="review-card__stars" role="img" aria-label="${t("Ocena {rating} na 5", { rating })}">
                ${renderStars(rating)}
              </div>
            </div>
            <blockquote class="review-card__text">${content}</blockquote>
          </article>`;
      })
      .join("");
  } catch (error) {
    console.error(error);
    track.innerHTML =
      `<p class="reviews__empty">${t("Nie udało się wczytać opinii.")}</p>`;
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  initSite();

  const contentReady = Promise.all([renderFeatured(), renderReviews()]).then(() => {
    qsa("[data-carousel]").forEach(setupCarousel);
  });
  setupAnchorNavigation(contentReady);

  await contentReady;
  await setupContactForm();
});
