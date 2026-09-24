<script setup lang="ts">
import { mdiGithub, mdiTranslate } from '@mdi/js'

const { version } = useRuntimeConfig().public
const { locale, locales, localeProperties, setLocale } = useI18n()
</script>

<template>
  <footer class="footer text-small text-medium-emphasis">
    <span>MeshCore Vitals v{{ version }}</span>
    <span aria-hidden="true">·</span>
    <a :href="REPOSITORY_URL" target="_blank" rel="noopener">
      <v-icon :icon="mdiGithub" size="14" />
      {{ $t('footer.source') }}
    </a>
    <span aria-hidden="true">·</span>
    <v-menu location="top">
      <template #activator="{ props: activator }">
        <button v-bind="activator" type="button" class="language" :aria-label="$t('footer.language', { name: localeProperties.name })">
          <v-icon :icon="mdiTranslate" size="14" />
          {{ locale.toUpperCase() }}
        </button>
      </template>
      <v-list density="compact" class="glass-dense">
        <v-list-item
          v-for="option in locales"
          :key="option.code"
          :title="option.name"
          :active="option.code === locale"
          color="primary"
          :lang="option.language"
          @click="setLocale(option.code)"
        />
      </v-list>
    </v-menu>
  </footer>
</template>

<style scoped lang="scss">
.footer {
  margin-top: auto;
  padding: 6px 16px max(6px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--glass-border);
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  white-space: nowrap;

  a,
  .language {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 28px;
    color: inherit;
    text-decoration: none;

    &:hover {
      color: rgb(var(--v-theme-primary));
    }
  }

  .language {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    cursor: pointer;
  }
}
</style>
