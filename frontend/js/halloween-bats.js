(() => {
  'use strict';
  // Loaded exclusively by the homepage; same campaign window as the pumpkin.
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const part = type => dateParts.find(value => value.type === type).value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  if (motion.matches || date < '2026-10-16' || date > '2026-10-31') return;

  let played = false;
  let flock = null;
  let cleanupTimer;
  const limit = () => Math.min(420, window.innerHeight * .65);

  function cleanup() {
    if (flock) flock.remove();
    flock = null;
    window.clearTimeout(cleanupTimer);
    window.removeEventListener('scroll', onScroll);
    motion.removeEventListener('change', onMotion);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  function onMotion() { if (motion.matches) cleanup(); }
  function onVisibility() { if (document.hidden && played) cleanup(); }

  function onScroll() {
    // A restored scroll position or a jump to another section must not trigger it.
    if (window.scrollY > limit()) { cleanup(); return; }
    if (played || window.scrollY < 12 || motion.matches) return;
    played = true;
    flock = document.createElement('div');
    flock.className = 'hf-bats';
    flock.setAttribute('aria-hidden', 'true');
    const count = window.innerWidth < 768 ? 5 : 8;
    for (let i = 0; i < count; i += 1) {
      const bat = document.createElement('span');
      bat.className = 'hf-bat';
      bat.style.setProperty('--bat-top', `${30 + (i * 13) % 45}%`);
      bat.style.setProperty('--bat-size', `${32 + (i * 11) % 32}px`);
      bat.style.setProperty('--bat-delay', `${i * .14}s`);
      bat.style.setProperty('--bat-duration', `${2.5 + (i % 3) * .22}s`);
      bat.innerHTML = '<svg viewBox="0 0 100 50" focusable="false" aria-hidden="true" fill="currentColor"><path class="hf-bat-wing" d="M49 23Q31 7 2 6Q11 18 8 32Q22 23 29 39Q39 29 49 36Z"/><path class="hf-bat-wing hf-bat-wing-right" d="M51 23Q69 7 98 6Q89 18 92 32Q78 23 71 39Q61 29 51 36Z"/><path d="m43 22 1-12 6 7 6-7 1 12q5 14-7 23-12-9-7-23Z"/></svg>';
      flock.appendChild(bat);
    }
    document.body.appendChild(flock);
    cleanupTimer = window.setTimeout(cleanup, 4400);
  }

  if (window.scrollY > limit()) return;
  window.addEventListener('scroll', onScroll, { passive: true });
  motion.addEventListener('change', onMotion);
  document.addEventListener('visibilitychange', onVisibility);
})();
