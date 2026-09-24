<script setup lang="ts">
defineProps<{ title: string, chip?: string, chipColor?: Tone }>()
</script>

<template>
  <v-card class="card">
    <div class="d-flex align-center justify-space-between ga-3">
      <h2 class="title">{{ title }}</h2>
      <v-chip v-if="chip" size="small" variant="tonal" :color="chipColor ?? 'primary'">{{ chip }}</v-chip>
    </div>
    <div class="stats">
      <slot />
    </div>
  </v-card>
</template>

<style scoped lang="scss">
.card {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: var(--text-subtitle);
  font-weight: 500;
  letter-spacing: 0.0125em;
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}
</style>
