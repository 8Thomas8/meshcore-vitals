import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import { version } from './package.json'
import { ELEVATION_API_URL, MAP_STYLE_URL } from './app/utils/constants'

// Nuxt inlines its config and payload as scripts and Vuetify sets inline
// styles, hence 'unsafe-inline'. The rest only allows what the app loads:
// Google Fonts, OpenFreeMap for the map and Open-Meteo for the elevation.
const CONTENT_SECURITY_POLICY = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com`,
  `img-src 'self' data: blob:`,
  `connect-src 'self' ${new URL(MAP_STYLE_URL).origin} ${new URL(ELEVATION_API_URL).origin}`,
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`
].join('; ')

const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  // Two years.
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Bluetooth, the GPS and the compass are all the app uses.
  'Permissions-Policy': 'bluetooth=(self), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self), camera=(), microphone=(), payment=(), usb=()'
}

const APP_NAME = 'MeshCore Vitals'
// THEME_COLORS.background, the colour around the app while it opens.
const BACKGROUND_COLOR = '#0c121d'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  modules: [
    '@nuxt/eslint',
    '@vite-pwa/nuxt',
    '@nuxtjs/i18n',
    (_options, nuxt) => {
      nuxt.hooks.hook('vite:extendConfig', (config) => {
        config.plugins?.push(vuetify({ autoImport: true }))
      })
    }
  ],

  build: { transpile: ['vuetify'] },

  vite: {
    vue: { template: { transformAssetUrls } }
  },

  devtools: { enabled: true },

  experimental: {
    // Windows Chrome cannot map the WSL project root as a DevTools workspace.
    chromeDevtoolsProjectSettings: false,
    // Nuxt's own check reloads on the next page change, which would drop the
    // Bluetooth link. The app-update plugin handles new deployments instead.
    checkOutdatedBuildInterval: false
  },

  css: ['vuetify/styles', '~/assets/scss/main.scss'],

  // Sent by Vercel. A route rule would become a Vercel route that ends the
  // routing, so the assets would miss the headers. This route lets the
  // routing go on.
  nitro: {
    vercel: {
      config: {
        routes: [{ src: '/(.*)', headers: SECURITY_HEADERS as Record<string, string>, continue: true }]
      }
    }
  },

  // Installable, and works offline once visited: the prerendered pages and
  // every asset are precached. A new deployment installs a new service worker
  // in the background, and the app-update plugin decides when to switch.
  pwa: {
    registerType: 'prompt',
    manifest: {
      name: APP_NAME,
      short_name: APP_NAME,
      description: 'Check the MeshCore network where you stand: coverage, link quality with nearby repeaters and overall health.',
      lang: 'en',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: BACKGROUND_COLOR,
      theme_color: BACKGROUND_COLOR,
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,json,png,svg,ico}'],
      globIgnores: [
        // Fetched fresh to spot a new deployment, never from the cache.
        '_nuxt/builds/**',
        '404.html',
        // Only the browser reads these, when installing.
        'pwa-*.png',
        'maskable-*.png'
      ],
      // Pages by the URL the host serves them at: Vercel serves
      // companion/index.html at /companion and not under its file name. The
      // module's own transform would also rename 200.html to /200, which no
      // host serves.
      manifestTransforms: [async entries => ({
        manifest: entries.map(entry => ({ ...entry, url: entry.url.replace(/(^|\/)index\.html$/, '') || '/' })),
        warnings: []
      })],
      // Any other page opens the SPA shell, which renders it on the client.
      navigateFallback: '/200.html',
      cleanupOutdatedCaches: true
    },
    client: {
      // The app-update plugin registers the worker itself, to decide when a
      // new one may reload the page.
      registerPlugin: false
    }
  },

  runtimeConfig: {
    public: { version }
  },

  // Rendered in English, then the locale plugin switches to the language
  // chosen in the footer or the browser's.
  i18n: {
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'fr', language: 'fr-FR', name: 'Français', file: 'fr.json' }
    ],
    defaultLocale: 'en',
    strategy: 'no_prefix',
    detectBrowserLanguage: false
  },

  app: {
    head: {
      title: APP_NAME,
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      meta: [
        { name: 'theme-color', content: BACKGROUND_COLOR },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: APP_NAME }
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&family=Roboto+Mono:wght@400;500&display=swap' }
      ]
    }
  }
})
