<script setup lang="ts">
// The logo: two overlapping "screens" (two viewers) with a play triangle — watching together.
defineProps<{ size?: number }>();
</script>

<template>
  <svg :width="size ?? 32" :height="size ?? 32" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="16" fill="var(--color-accent)" />
    <circle cx="24" cy="32" r="13" fill="none" stroke="var(--color-accent-contrast)" stroke-width="5" />
    <circle
      cx="40"
      cy="32"
      r="13"
      fill="none"
      stroke="var(--color-accent-contrast)"
      stroke-width="5"
      opacity="0.55"
    />
    <path d="M28 25 L39 32 L28 39 Z" fill="var(--color-accent-contrast)" />
  </svg>
</template>
