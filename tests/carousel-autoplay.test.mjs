import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarouselAutoplay } from '../assets/js/carousel-autoplay.js';

function clock(duration = 5000) {
  let time = 0, nextId = 0, progress = 0, advances = 0;
  const frames = new Map();
  const timer = createCarouselAutoplay({ duration,
    now: () => time,
    requestFrame: callback => { frames.set(++nextId, callback); return nextId; },
    cancelFrame: id => frames.delete(id),
    onProgress: value => progress = value,
    onAdvance: () => advances++,
  });
  return { timer, get progress() { return progress; }, get advances() { return advances; },
    get pending() { return frames.size; },
    advance(ms) { time += ms; const queued = [...frames.values()]; frames.clear(); queued.forEach(callback => callback()); },
  };
}
test('the indicator and automatic slide change use the same deadline', () => {
  const c = clock(); c.timer.start(); c.timer.start();
  assert.equal(c.pending, 1);
  c.advance(2500); assert.equal(c.progress, .5); assert.equal(c.advances, 0);
  c.advance(2499); assert.equal(c.advances, 0);
  c.advance(1); assert.equal(c.advances, 1); assert.equal(c.progress, 0);
  c.advance(1000); assert.equal(c.progress, .2);
});
test('overlapping pauses retain remaining time until all reasons are cleared', () => {
  const c = clock(); c.timer.start(); c.advance(2000);
  c.timer.pause('hover'); c.timer.pause('focus'); assert.equal(c.pending, 0);
  c.advance(10000); assert.equal(c.progress, .4); assert.equal(c.advances, 0);
  c.timer.resume('hover'); c.timer.resume('unknown'); assert.equal(c.pending, 0);
  c.timer.resume('focus'); c.advance(2999); assert.equal(c.advances, 0);
  c.advance(1); assert.equal(c.advances, 1);
});
test('manual navigation resets the countdown even while paused', () => {
  const c = clock(); c.timer.start(); c.advance(4500);
  c.timer.pause('pointer'); c.timer.reset(); assert.equal(c.progress, 0);
  c.advance(5000); c.timer.resume('pointer'); c.advance(4999); assert.equal(c.advances, 0);
  c.advance(1); assert.equal(c.advances, 1);
});
test('background pause, disabled autoplay and stop do not schedule frames', () => {
  const c = clock(); c.timer.pause('hidden'); c.timer.start(); assert.equal(c.pending, 0);
  c.advance(60000); c.timer.resume('hidden'); c.advance(1000); assert.equal(c.progress, .2);
  c.timer.stop(); c.advance(10000); assert.equal(c.pending, 0); assert.equal(c.advances, 0);
  for (const duration of [0, -1, NaN]) { const disabled = clock(duration); disabled.timer.pause('hover'); disabled.timer.reset(); disabled.timer.start(); assert.equal(disabled.pending, 0); assert.equal(disabled.progress, 0); }
});
