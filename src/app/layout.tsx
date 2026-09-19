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
                  // Prevent third-party Chrome extensions from triggering Next.js dev error overlay
                  window.addEventListener('error', function(e) {
                    if (
                      (e.filename && e.filename.indexOf('chrome-extension://') !== -1) ||
                      (e.message && (e.message.indexOf('M_ID') !== -1 || e.message.indexOf('bis_') !== -1))
                    ) {
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
                            try { str += ' ' + JSON.stringify(arg); } catch(e) {}
                          }
                        }
                        if (
                          str.indexOf('bis_skin_checked') !== -1 ||
                          str.indexOf('bis_register') !== -1 ||
                          str.indexOf('__processed_') !== -1 ||
                          str.indexOf('chrome-extension://') !== -1 ||
                          str.indexOf('M_ID') !== -1
                        ) {
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
