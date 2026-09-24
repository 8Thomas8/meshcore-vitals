<script setup lang="ts">
import { useLocale } from 'vuetify'

const { locale } = useI18n()
const { current: vuetifyLocale } = useLocale()

useHead({ htmlAttrs: { lang: locale } })
// Vuetify's own labels, such as its buttons' accessible names, follow along.
watchEffect(() => {
  vuetifyLocale.value = locale.value
})
</script>

<template>
  <v-app>
    <NuxtPwaManifest />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </v-app>
</template>
