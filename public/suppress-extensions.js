(function () {
  if (typeof window === 'undefined') return;

  // 1. Intercept setAttribute to stop extensions (e.g. Bitdefender Anti-tracker) from injecting bis_skin_checked
  try {
    var originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (name === 'bis_skin_checked' || name === 'bis_register') {
        return;
      }
      return originalSetAttribute.apply(this, arguments);
    };
  } catch (e) {}

  // 2. Clean up any attributes that might have been injected before execution
  try {
    var clean = function () {
      var els = document.querySelectorAll('[bis_skin_checked], [bis_register]');
      for (var i = 0; i < els.length; i++) {
        els[i].removeAttribute('bis_skin_checked');
        els[i].removeAttribute('bis_register');
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', clean, { once: true });
    } else {
      clean();
    }
  } catch (e) {}

  // 3. Intercept unhandled runtime errors thrown by browser extensions (e.g. Urban VPN, Bitdefender)
  try {
    window.addEventListener(
      'error',
      function (event) {
        var file = (event && event.filename) || '';
        var msg = (event && event.message) || '';
        var stack = (event && event.error && event.error.stack) || '';
        if (
          file.indexOf('chrome-extension://') !== -1 ||
          file.indexOf('moz-extension://') !== -1 ||
          file.indexOf('safari-web-extension://') !== -1 ||
          stack.indexOf('chrome-extension://') !== -1 ||
          msg.indexOf('M_ID') !== -1 ||
          msg.indexOf('bis_skin_checked') !== -1
        ) {
          event.stopImmediatePropagation();
          event.preventDefault();
          return true;
        }
      },
      true // Capture phase before Next.js error overlay
    );

    window.addEventListener(
      'unhandledrejection',
      function (event) {
        var reason = String((event && event.reason && (event.reason.stack || event.reason.message)) || event.reason || '');
        if (
          reason.indexOf('chrome-extension://') !== -1 ||
          reason.indexOf('moz-extension://') !== -1 ||
          reason.indexOf('safari-web-extension://') !== -1 ||
          reason.indexOf('M_ID') !== -1
        ) {
          event.stopImmediatePropagation();
          event.preventDefault();
          return true;
        }
      },
      true
    );
  } catch (e) {}

  // 4. Filter extension-induced errors from console.error in dev mode
  try {
    var origError = console.error;
    console.error = function () {
      var args = Array.prototype.slice.call(arguments);
      var text = args.map(function (a) { return String(a || ''); }).join(' ');
      if (
        text.indexOf('bis_skin_checked') !== -1 ||
        text.indexOf('bis_register') !== -1 ||
        text.indexOf('chrome-extension://') !== -1 ||
        text.indexOf('M_ID') !== -1
      ) {
        return;
      }
      return origError.apply(console, arguments);
    };
  } catch (e) {}

  // 5. Purge service worker and CacheStorage if accessing scanner or cloudflare tunnel
  try {
    if (
      window.location.pathname.startsWith('/scanner') ||
      window.location.hostname.indexOf('trycloudflare.com') !== -1
    ) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
          for (var i = 0; i < registrations.length; i++) {
            registrations[i].unregister();
          }
        });
      }
      if ('caches' in window) {
        caches.keys().then(function (names) {
          for (var j = 0; j < names.length; j++) {
            caches.delete(names[j]);
          }
        });
      }
    }
  } catch (e) {}
})();

