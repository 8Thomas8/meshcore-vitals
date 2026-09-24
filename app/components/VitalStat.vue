<script setup lang="ts">
defineProps<{
  label: string
  value: string
  unit?: string
  hint?: string
  tone?: Tone
}>()
</script>

<template>
  <div class="stat">
    <span class="text-small text-medium-emphasis">{{ label }}</span>
    <span class="value font-mono" :class="tone && `text-${tone}`">
      {{ value }}<span v-if="unit" class="unit text-medium-emphasis">{{ unit }}</span>
    </span>
    <span v-if="hint" class="text-small text-disabled">{{ hint }}</span>
  </div>
</template>

<style scoped lang="scss">
.stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.value {
  font-size: var(--text-title);
  font-weight: 500;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.unit {
  margin-left: 3px;
  font-size: var(--text-caption);
}
</style>
