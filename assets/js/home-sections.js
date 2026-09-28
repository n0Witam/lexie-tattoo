// WebKit can pull an oversized snap area back to its start. Leave long
// compositions in normal document flow so every part remains reachable.
export function setupHomeSections() {
  const root = document.documentElement;
  if (!root.classList.contains('home')) return;
  const sections = [...document.querySelectorAll('main > section')];
  let frame = 0;
  const update = () => {
    frame = 0;
    const offset = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    const available = window.innerHeight - offset;
    const measured = sections.map(section => [section, section.getBoundingClientRect().height]);
    for (const [section, height] of measured) {
      section.classList.toggle('is-scrollable-section', height > available + 2);
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(schedule);
  for (const section of sections) observer.observe(section);
  const header = document.querySelector('.site-header');
  if (header) observer.observe(header);
  window.addEventListener('resize', schedule, { passive: true });
  update();
}
