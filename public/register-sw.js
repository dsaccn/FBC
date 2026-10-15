if ('serviceWorker' in navigator) {
  var isTunnelOrScanner =
    window.location.pathname.startsWith('/scanner') ||
    window.location.hostname.indexOf('trycloudflare.com') !== -1;

  if (isTunnelOrScanner) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      for (var i = 0; i < registrations.length; i++) {
        registrations[i].unregister();
      }
    });
    if ('caches' in window) {
      caches.keys().then(function (names) {
        for (var j = 0; j < names.length; j++) {
          caches.delete(names[j]);
        }
      });
    }
  } else {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(function (reg) {
          console.log('[PWA] Service worker registered, scope:', reg.scope);
        })
        .catch(function (err) {
          console.warn('[PWA] Service worker registration failed:', err);
        });
    });
  }
}
