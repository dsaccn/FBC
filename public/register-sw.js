if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(function(reg) {
        console.log('[PWA] Service worker registered, scope:', reg.scope);
      })
      .catch(function(err) {
        console.warn('[PWA] Service worker registration failed:', err);
      });
  });
}
