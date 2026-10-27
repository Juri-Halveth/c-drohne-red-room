(() => {
  'use strict';
  const video = document.getElementById('night-video');
  const fallback = document.getElementById('night-fallback');
  const message = document.getElementById('night-status');
  if (!video || !fallback || !message) return;
  function showFallback() {
    video.hidden = true;
    fallback.hidden = false;
    message.hidden = false;
  }
  video.addEventListener('error', showFallback, { once: true });
  if (video.error) showFallback();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!video.error && !reduced.matches) video.play().catch(() => {});
  reduced.addEventListener('change', event => { if (event.matches) video.pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
})();
