import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { en, fr } from 'vuetify/locale'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(createVuetify({
    ssr: true,
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    locale: { locale: 'en', fallback: 'en', messages: { en, fr } },
    theme: {
      defaultTheme: 'glass',
      themes: {
        glass: {
          dark: true,
          colors: THEME_COLORS,
          variables: {
            'medium-emphasis-opacity': 0.7,
            'disabled-opacity': 0.5
          }
        }
      }
    },
    defaults: {
      VCard: { class: 'glass', variant: 'flat', rounded: 'xl' },
      VSheet: { class: 'glass' }
    }
  }))
})
