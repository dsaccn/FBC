import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'MEBA TECH PRO — POS & Management',
  description: 'Point of Sale & Management System by MEBA TECH',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MEBA TECH PRO',
  },
}

export const viewport: Viewport = {
  themeColor: '#00E5FF',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  function isExtensionNoise(msg, filename, stack) {
                    var text = (msg || '') + ' ' + (filename || '') + ' ' + (stack || '');
                    return (
                      text.indexOf('chrome-extension://') !== -1 ||
                      text.indexOf('eppiocemhmnlbhjplcgkofciiegomcon') !== -1 ||
                      text.indexOf('M_ID') !== -1 ||
                      text.indexOf('bis_') !== -1 ||
                      text.indexOf('bis_skin_checked') !== -1
                    );
                  }

                  // Intercept window errors during capture phase before Next.js overlay
                  window.addEventListener('error', function(e) {
                    var stack = (e.error && e.error.stack) || '';
                    if (isExtensionNoise(e.message, e.filename, stack)) {
                      e.stopImmediatePropagation();
                      e.preventDefault();
                      return true;
                    }
                  }, true);

                  // Intercept unhandled promise rejections from extensions
                  window.addEventListener('unhandledrejection', function(e) {
                    var reason = e.reason;
                    var stack = (reason && reason.stack) || '';
                    var message = (reason && (reason.message || String(reason))) || '';
                    if (isExtensionNoise(message, '', stack)) {
                      e.stopImmediatePropagation();
                      e.preventDefault();
                      return true;
                    }
                  }, true);

                  var currentError = console.error;
                  Object.defineProperty(console, 'error', {
                    configurable: true,
                    enumerable: true,
                    get: function() {
                      return function() {
                        var str = '';
                        for (var i = 0; i < arguments.length; i++) {
                          var arg = arguments[i];
                          if (typeof arg === 'string') {
                            str += ' ' + arg;
                          } else if (arg && (arg.message || arg.stack)) {
                            str += ' ' + (arg.message || '') + ' ' + (arg.stack || '');
                          } else {
                            try { str += ' ' + JSON.stringify(arg); } catch(err) {}
                          }
                        }
                        if (isExtensionNoise(str, '', '')) {
                          return;
                        }
                        return currentError.apply(console, arguments);
                      };
                    },
                    set: function(fn) {
                      currentError = fn;
                    }
                  });
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        {/* Register service worker for offline support */}
        <Script
          id="register-sw"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
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
            `,
          }}
        />
      </body>
    </html>
  )
}
