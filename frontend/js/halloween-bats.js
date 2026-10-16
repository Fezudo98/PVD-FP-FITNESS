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
    if (window.scrollY > (played ? window.innerHeight : limit())) { cleanup(); return; }
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
      bat.style.setProperty('--bat-size', `${(window.innerWidth < 768 ? 78 : 100) + (i * 13) % 40}px`);
      bat.style.setProperty('--bat-delay', `${i * .14}s`);
      bat.style.setProperty('--bat-duration', `${3.8 + (i % 3) * .25}s`);
      bat.innerHTML = `<svg viewBox="0 0 100 56" focusable="false" aria-hidden="true" fill="currentColor">
        <g class="hf-bat-wing">
          <path class="hf-bat-outline" d="M43 25Q25 5 2 7Q12 19 7 36Q20 26 27 43Q34 32 44 38Z"/>
          <path class="hf-bat-rib" d="M43 29 8 11M42 31Q25 18 27 40"/>
        </g>
        <g class="hf-bat-wing hf-bat-wing-right">
          <path class="hf-bat-outline" d="M57 25Q75 5 98 7Q88 19 93 36Q80 26 73 43Q66 32 56 38Z"/>
          <path class="hf-bat-rib" d="M57 29 92 11M58 31Q75 18 73 40"/>
        </g>
        <path class="hf-bat-outline hf-bat-body" d="M37 23 35 5 47 17Q50 15 53 17L65 5 63 23Q69 36 60 46L50 52 40 46Q31 36 37 23Z"/>
        <path class="hf-bat-ear" d="m39 12 2 11 5-3Zm22 0-2 11-5-3Z"/>
        <ellipse class="hf-bat-eye" cx="43" cy="28" rx="4.5" ry="4"/>
        <ellipse class="hf-bat-eye" cx="57" cy="28" rx="4.5" ry="4"/>
        <ellipse class="hf-bat-pupil" cx="44" cy="28" rx="1.5" ry="2.8"/>
        <ellipse class="hf-bat-pupil" cx="56" cy="28" rx="1.5" ry="2.8"/>
        <path class="hf-bat-nose" d="m47 33 3 3 3-3Z"/>
        <path class="hf-bat-mouth" d="M40 37Q50 40 60 37Q58 48 50 47Q42 48 40 37Z"/>
        <path class="hf-bat-fangs" d="m42 38 2 7 3-6Zm11 1 3 6 2-7Z"/>
      </svg>`;
      flock.appendChild(bat);
    }
    document.body.appendChild(flock);
    cleanupTimer = window.setTimeout(cleanup, 5600);
  }

  if (window.scrollY > limit()) return;
  window.addEventListener('scroll', onScroll, { passive: true });
  motion.addEventListener('change', onMotion);
  document.addEventListener('visibilitychange', onVisibility);
})();
