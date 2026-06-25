<script lang="ts" setup>
import { twMerge } from 'tailwind-merge'
import { thumbHashToDataURL } from 'thumbhash'
import type { CSSProperties } from 'vue'

const props = defineProps<{
  thumbhash: ArrayLike<number> | string
  class?: string
}>()

const dataUrl = computed(() => {
  if (typeof props.thumbhash === 'string') {
    return thumbHashToDataURL(decompressUint8Array(props.thumbhash))
  }

  return thumbHashToDataURL(props.thumbhash)
})

const backgroundStyle = computed<CSSProperties>(() => ({
  backgroundImage: `url(${dataUrl.value})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
}))
</script>

<template>
  <div
    aria-hidden="true"
    :class="twMerge('w-full h-full', props.class)"
    :style="backgroundStyle"
  />
</template>

<style scoped></style>
