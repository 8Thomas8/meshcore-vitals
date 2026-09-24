<script setup lang="ts">
import { mdiBluetooth } from '@mdi/js'

const { status, error, connect } = useMeshCore()
const { message } = useFormat()

const bluetoothSupported = ref(true)
onMounted(() => {
  bluetoothSupported.value = 'bluetooth' in navigator
})
</script>

<template>
  <v-container class="connect d-flex flex-column flex-grow-1 justify-center align-center ga-4 text-center">
    <AppLogo class="mb-2" />
    <h1 class="heading">MeshCore Vitals</h1>
    <p class="tagline text-medium-emphasis">{{ $t('connect.tagline') }}</p>

    <div class="w-100 mt-2 d-flex flex-column ga-2">
      <v-btn
        block
        size="x-large"
        rounded="pill"
        color="primary"
        :prepend-icon="mdiBluetooth"
        :loading="status === 'connecting'"
        :disabled="!bluetoothSupported"
        @click="connect"
      >
        {{ $t('connect.button') }}
      </v-btn>
      <p v-if="!bluetoothSupported" class="text-hint text-error">{{ $t('connect.noBluetooth') }}</p>
      <p v-else-if="error" class="text-hint text-error">{{ message(error) }}</p>
      <p v-else class="text-hint text-disabled">{{ $t('connect.hint') }}</p>
    </div>
  </v-container>
</template>

<style scoped lang="scss">
.connect {
  max-width: 390px;
}

.heading {
  margin: 0;
  line-height: 1.2;
  font-size: var(--text-display);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.tagline {
  max-width: 30ch;
  font-size: var(--text-body);
}
</style>
