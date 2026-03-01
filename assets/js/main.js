import { fetchJSON, resolveUrl, qs, qsa } from "./util.js";
import { initSite, openFreePatternModal, setupContactForm } from "./site.js";

const DATA_URL = "./data/portfolio.json";

/* ============================================================
   Carousel
   - loop clones
   - click slide (desktop) to center
   - prev/next hit-areas (desktop via CSS)
   - CTA "Chcę ten wzór!" arms after 1s when a FREE slide is centered
   ============================================================ */
function setupCarousel(root) {
  const track = qs("[data-track]", root);
  if (!track) return;

  if (track.dataset.carouselInit === "1") return;
  track.dataset.carouselInit = "1";

  // Anti-save (carousel only)
  track.addEventListener("contextmenu", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG") e.preventDefault();
  });
  track.addEventListener("dragstart", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG") e.preventDefault();
  });

  const slidesAll = () => Array.from(track.querySelectorAll(".slide"));

  const getStep = () => {
    const slides = slidesAll();
    if (slides.length >= 2) return slides[1].offsetLeft - slides[0].offsetLeft;
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

  let programmaticUntil = 0;
  const markProgrammatic = (ms = 250) => {
    programmaticUntil = performance.now() + ms;
  };
  const isProgrammatic = () => performance.now() < programmaticUntil;

  const centerToIndex = (idx, behavior = "smooth") => {
    const slides = slidesAll();
    if (!slides.length) return;

    idx = Math.max(0, Math.min(slides.length - 1, idx));
    const el = slides[idx];

    const delta = getSlideCenterX(el) - getTrackCenterX();
    markProgrammatic(300);
    track.scrollBy({ left: delta, behavior });
  };

  const next = () => {
    const behavior = prefersReduced ? "auto" : "smooth";
    centerToIndex(getCenteredIndex() + 1, behavior);
  };

  const prev = () => {
    const behavior = prefersReduced ? "auto" : "smooth";
    centerToIndex(getCenteredIndex() - 1, behavior);
  };

  // Desktop: click slide to center
  const isDesktopPointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;

  if (isDesktopPointer) {
    track.addEventListener("click", (e) => {
      const slide = e.target.closest(".slide");
      if (!slide) return;
      const slides = slidesAll();
      const idx = slides.indexOf(slide);
      if (idx < 0) return;

      const behavior = prefersReduced ? "auto" : "smooth";
      centerToIndex(idx, behavior);
    });
  }

  // Desktop: invisible prev/next hit-areas (56px) – inserted once
  if (isDesktopPointer && !root.querySelector(".carousel__nav--prev")) {
    const btnPrev = document.createElement("button");
    btnPrev.type = "button";
    btnPrev.className = "carousel__nav carousel__nav--prev";
    btnPrev.setAttribute("aria-label", "Poprzednie zdjęcie");
    btnPrev.addEventListener("click", () => prev());

    const btnNext = document.createElement("button");
    btnNext.type = "button";
    btnNext.className = "carousel__nav carousel__nav--next";
    btnNext.setAttribute("aria-label", "Następne zdjęcie");
    btnNext.addEventListener("click", () => next());

    root.append(btnPrev, btnNext);
  }

  // ========== Loop clones ==========
  const initLoop = () => {
    if (track.dataset.loopInit === "1") return;

    const slides = slidesAll();
    if (slides.length < 2) return;

    const originalsCount = slides.length;
    const cloneCount = Math.min(3, originalsCount);

    const headClones = slides
      .slice(0, cloneCount)
      .map((el) => el.cloneNode(true));
    const tailClones = slides
      .slice(-cloneCount)
      .map((el) => el.cloneNode(true));

    headClones.forEach((c) => c.setAttribute("data-clone", "1"));
    tailClones.forEach((c) => c.setAttribute("data-clone", "1"));

    tailClones.reverse().forEach((c) => track.prepend(c));
    headClones.forEach((c) => track.append(c));

    track.dataset.loopInit = "1";

    requestAnimationFrame(() => {
      const step = getStep();
      track.scrollLeft = cloneCount * step;
      requestAnimationFrame(() => centerToIndex(getCenteredIndex(), "auto"));
    });

    let lock = false;
    let scrollEndT = null;

    const normalizeLoop = () => {
      if (lock) return;

      if (isProgrammatic()) {
        scrollEndT = setTimeout(normalizeLoop, 120);
        return;
      }

      const step = getStep();
      const start = cloneCount * step;
      const end = start + originalsCount * step;

      if (track.scrollLeft < start - step * 0.25) {
        lock = true;
        markProgrammatic(350);
        track.scrollLeft = track.scrollLeft + originalsCount * step;
        requestAnimationFrame(() => (lock = false));
      } else if (track.scrollLeft > end + step * 0.25) {
        lock = true;
        markProgrammatic(350);
        track.scrollLeft = track.scrollLeft - originalsCount * step;
        requestAnimationFrame(() => (lock = false));
      }
    };

    track.addEventListener(
      "scroll",
      () => {
        if (scrollEndT) clearTimeout(scrollEndT);
        scrollEndT = setTimeout(normalizeLoop, 140);
      },
      { passive: true },
    );
  };

  // ========== Autoplay ==========
  const autoplayMs = Number(root.getAttribute("data-autoplay") || "5000");
  const enabledAutoplay = Number.isFinite(autoplayMs) && autoplayMs > 0;

  let timer = null;
  let paused = false;

  const start = () => {
    if (!enabledAutoplay) return;
    stop();
    timer = window.setInterval(() => {
      if (!paused) next();
    }, autoplayMs);
  };

  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = null;
  };

  root.addEventListener("mouseenter", () => (paused = true));
  root.addEventListener("mouseleave", () => (paused = false));
  root.addEventListener("focusin", () => (paused = true));
  root.addEventListener("focusout", () => (paused = false));

  let userHold = null;
  const pauseOnUser = () => {
    paused = true;
    if (userHold) window.clearTimeout(userHold);
    userHold = window.setTimeout(() => (paused = false), 2000);
  };
  track.addEventListener("pointerdown", pauseOnUser, { passive: true });
  track.addEventListener("touchstart", pauseOnUser, { passive: true });
  track.addEventListener("wheel", pauseOnUser, { passive: true });

  // ========== CTA arming ==========
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
  start();

  // initial arm after initial loop jump
  window.setTimeout(armCenteredCta, 900);
}

/* ============================================================
   Featured carousel render + "Wolny wzór!" badge + CTA button
   ============================================================ */
async function renderFeatured() {
  const carouselTrack = qs("#featuredTrack");
  if (!carouselTrack) return;

  try {
    const { data, url } = await fetchJSON(DATA_URL);

    const items = Array.isArray(data.items) ? data.items : [];
    const byId = new Map(items.map((x) => [x.id, x]));

    // IDs in "Wolne wzory" group
    const groups = Array.isArray(data.groups) ? data.groups : [];
    const freeGroup = groups.find(
      (g) =>
        String(g?.name || "")
          .trim()
          .toLowerCase() === "wolne wzory",
    );
    const freeIdsRaw = freeGroup && (freeGroup.items || freeGroup.ids);
    const freeIds = Array.isArray(freeIdsRaw) ? freeIdsRaw : [];
    const freeSet = new Set(freeIds);

    // Order: featuredOrder + append missing featured
    const seen = new Set();
    const featuredIds = [];

    const pushIfFeatured = (id) => {
      if (!id || seen.has(id)) return;
      const it = byId.get(id);
      if (!it || !it.featured) return;
      seen.add(id);
      featuredIds.push(id);
    };

    const order = Array.isArray(data.featuredOrder) ? data.featuredOrder : [];
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
        "Brak prac do wyświetlenia — dodaj je w data/portfolio.json.",
      );
      return;
    }

    carouselTrack.innerHTML = "";

    for (const item of featured) {
      const src = resolveUrl(item.src, url);

      const img = document.createElement("img");
      img.src = src;
      img.alt = item.alt || "Tatuaż – praca Lexie";
      img.loading = "eager";
      img.decoding = "async";
      img.draggable = false;

      const fig = document.createElement("figure");
      fig.className = "slide";

      if (freeSet.has(item.id)) {
        fig.dataset.freePattern = "1";

        const badge = document.createElement("div");
        badge.className = "slide__badge";
        badge.textContent = "Wolny wzór!";
        fig.append(badge);

        const ctaWrap = document.createElement("div");
        ctaWrap.className = "slide__ctaWrap";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slide__ctaBtn btn btn--primary";
        btn.textContent = "Chcę ten wzór!";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openFreePatternModal(src, img.alt);
        });

        ctaWrap.append(btn);
        fig.append(ctaWrap);
      }

      fig.append(img);
      carouselTrack.append(fig);
    }
  } catch (err) {
    console.error(err);
    carouselTrack.innerHTML = "";
    carouselTrack.append(
      "Nie udało się wczytać galerii (sprawdź ścieżki i JSON).",
    );
  }
}

/* ============================================================
   Boot
   ============================================================ */


window.addEventListener("DOMContentLoaded", async () => {
  initSite();

  await renderFeatured();
  qsa("[data-carousel]").forEach(setupCarousel);

  // Home page only.
  await setupContactForm();
});
