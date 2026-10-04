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

  // 3. Filter extension-induced hydration noise from console.error in dev mode
  try {
    var origError = console.error;
    console.error = function () {
      var args = Array.prototype.slice.call(arguments);
      var text = args.map(function (a) { return String(a || ''); }).join(' ');
      if (text.indexOf('bis_skin_checked') !== -1 || text.indexOf('bis_register') !== -1) {
        return;
      }
      return origError.apply(console, arguments);
    };
  } catch (e) {}
})();
