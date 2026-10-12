import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarouselScroller } from '../assets/js/carousel-scroll.js';

function fixture() {
  let time = 0, id = 0;
  const frames = new Map(), styles = new Map(), writes = [], updates = [];
  const track = { scrollLeft: 100, scrollTop: 7,
    style: {
      getPropertyValue: name => styles.get(name)?.[0] || '',
      getPropertyPriority: name => styles.get(name)?.[1] || '',
      setProperty: (name, value, priority = '') => styles.set(name, [value, priority]),
      removeProperty: name => styles.delete(name),
    },
    scrollTo(options) {
      writes.push(options);
      this.scrollLeft = options.left; this.scrollTop = options.top;
    },
  };
  const scroller = createCarouselScroller(track, {
    now: () => time, duration: 400,
    requestFrame: callback => { frames.set(++id, callback); return id; },
    cancelFrame: id => frames.delete(id),
    onUpdate: () => updates.push(track.scrollLeft),
  });
  return { track, scroller, frames, writes, updates,
    advance(ms, frameTime) { time += ms; const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn(frameTime ?? time)); },
  };
}

test('scrolling and depth updates share a frame without toggling native snapping', () => {
  const c = fixture(); c.scroller.scrollTo(600);
  assert.equal(c.scroller.isAnimating, true);
  assert.equal(c.track.style.getPropertyValue('scroll-snap-type'), '');
  c.advance(200); assert.ok(c.track.scrollLeft > 100 && c.track.scrollLeft < 600);
  c.advance(200); assert.equal(c.track.scrollLeft, 600);
  assert.equal(c.track.scrollTop, 0); assert.equal(c.frames.size, 0);
  assert.equal(c.scroller.isAnimating, false);
  assert.equal(c.track.style.getPropertyValue('scroll-snap-type'), '');
  assert.deepEqual(c.writes.map(w => w.left), c.updates);
  assert.ok(c.writes.every(w => w.behavior === 'instant' && w.top === 0));
});

test('a delayed frame with a stale timestamp does not extend the animation', () => {
  const c = fixture(); c.scroller.scrollTo(600);
  c.advance(600, 100);
  assert.equal(c.track.scrollLeft, 600);
  assert.equal(c.frames.size, 0);
  assert.equal(c.scroller.isAnimating, false);
});

test('rapid navigation replaces the old target and manual input can cancel animation', () => {
  const c = fixture(); c.track.style.setProperty('scroll-snap-type', 'x mandatory', 'important');
  c.scroller.scrollTo(600); c.advance(100); const position = c.track.scrollLeft;
  c.scroller.scrollTo(50); assert.equal(c.frames.size, 1);
  c.advance(100); assert.ok(c.track.scrollLeft < position);
  c.scroller.cancel(); const stopped = c.track.scrollLeft; c.advance(1000);
  assert.equal(c.track.scrollLeft, stopped); assert.equal(c.frames.size, 0);
  assert.equal(c.track.style.getPropertyValue('scroll-snap-type'), 'x mandatory');
  assert.equal(c.track.style.getPropertyPriority('scroll-snap-type'), 'important');
});

test('loop jumps and reduced-motion navigation cancel pending animation and update immediately', () => {
  const c = fixture(); c.scroller.scrollTo(600); c.advance(100);
  c.scroller.scrollTo(1500, 'auto'); assert.equal(c.track.scrollLeft, 1500);
  assert.equal(c.updates.at(-1), 1500); assert.equal(c.frames.size, 0);
  c.advance(1000); assert.equal(c.track.scrollLeft, 1500);
});
