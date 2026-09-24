<script setup lang="ts">
import { mdiUpdate } from '@mdi/js'

const { available, apply } = useAppUpdate()
const { connection } = useMeshCore()
const dismissed = ref(false)

// Without a node connected the plugin reloads by itself before this shows,
// unless that reload already failed to bring the new version.
const open = computed({
  get: () => available.value && !dismissed.value,
  set: (value) => {
    if (!value) dismissed.value = true
  }
})
</script>

<template>
  <v-snackbar v-model="open" class="update" location="top" :timeout="-1" rounded="xl" color="surface">
    <div class="d-flex align-center ga-3">
      <v-icon :icon="mdiUpdate" color="primary" />
      <span>{{ $t('update.available') }}<template v-if="connection"> {{ $t('update.disconnects') }}</template></span>
    </div>
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ $t('update.later') }}</v-btn>
      <v-btn variant="tonal" color="primary" @click="apply">{{ $t('update.reload') }}</v-btn>
    </template>
  </v-snackbar>
</template>

<style scoped lang="scss">
.update :deep(.v-snackbar__wrapper) {
  border: 1px solid var(--glass-border);
}
</style>
