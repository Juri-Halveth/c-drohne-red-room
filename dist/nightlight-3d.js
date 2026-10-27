(() => {
  'use strict';
  const video = document.getElementById('night-video');
  const fallback = document.getElementById('night-fallback');
  const message = document.getElementById('night-status');
  if (!video || !fallback || !message) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!reduced.matches) video.play().catch(() => {});
  reduced.addEventListener('change', event => { if (event.matches) video.pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
  video.addEventListener('error', () => {
    video.hidden = true;
    fallback.hidden = false;
    message.hidden = false;
  }, { once: true });
})();
