<script setup lang="ts">
import { mdiMenu } from '@mdi/js'
import { useDisplay } from 'vuetify'

const { connection } = useMeshCore()
const { smAndDown } = useDisplay()
const route = useRoute()
const menuOpen = ref(false)
</script>

<template>
  <div>
    <template v-if="connection">
      <v-app-bar class="glass app-bar" flat>
        <div class="page-width app-bar-content d-flex align-center ga-3">
          <v-btn v-if="!smAndDown" class="ms-n3" :icon="mdiMenu" variant="text" :aria-label="$t('nav.openMenu')" @click="menuOpen = true" />
          <img class="d-block" src="/favicon.svg" alt="" width="28" height="28">
          <span class="text-title">MeshCore Vitals</span>
        </div>
      </v-app-bar>
      <v-bottom-navigation v-if="smAndDown" class="glass bottom-nav" grow color="primary">
        <v-btn v-for="item in NAV_ITEMS" :key="item.to" :to="item.to" exact>
          <v-icon :icon="item.icon" />
          <span>{{ $t(item.title) }}</span>
        </v-btn>
      </v-bottom-navigation>
      <v-navigation-drawer v-else v-model="menuOpen" class="glass" temporary width="260">
        <v-list nav color="primary">
          <v-list-item v-for="item in NAV_ITEMS" :key="item.to" :to="item.to" exact :prepend-icon="item.icon" :title="$t(item.title)" rounded="lg" />
        </v-list>
      </v-navigation-drawer>
    </template>
    <v-main>
      <div class="backdrop" aria-hidden="true" />
      <div class="content" :class="{ 'above-nav': connection && smAndDown }">
        <ConnectScreen v-if="!connection" />
        <!-- Every page needs a node, they only show once one is connected. -->
        <slot v-if="connection" />
        <AppFooter v-if="!connection || route.path === '/companion'" />
      </div>
      <UpdateBanner />
    </v-main>
  </div>
</template>

<style scoped lang="scss">
.backdrop {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(circle 260px at calc(100% - 90px) 120px, var(--backdrop-halo), transparent),
    radial-gradient(circle 220px at 60px calc(100% - 124px), var(--backdrop-halo), transparent);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle, var(--backdrop-dot) 1px, transparent 1.5px) 0 0 / 18px 18px;
    mask-image: radial-gradient(ellipse at center, black, transparent 85%);
  }
}

.content {
  position: relative;
  // v-main pads itself around the menus.
  min-height: calc(100dvh - var(--v-layout-top, 0px) - var(--v-layout-bottom, 0px));
  display: flex;
  flex-direction: column;

  // Room for the floating menu's offset, which v-main does not count.
  &.above-nav {
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }
}

// A bar along the top edge, only its bottom border shows.
.app-bar {
  border-width: 0 0 1px !important;
}

// Same width and gutter as the cards below.
.app-bar-content {
  width: 100%;
  padding-inline: 16px;
}

// Floats above the page, clear of the screen edges and the home indicator.
.bottom-nav {
  left: 12px !important;
  bottom: calc(12px + env(safe-area-inset-bottom)) !important;
  width: calc(100% - 24px) !important;
  border-radius: 999px;

  :deep(.v-bottom-navigation__content) {
    padding: 6px;
    gap: 4px;
  }

  // Vuetify caps each item at 168px, so the hover and active pill would not
  // fill its share of the bar.
  :deep(.v-btn) {
    max-width: none;
    height: 100% !important;
    border-radius: 999px;
  }
}
</style>
