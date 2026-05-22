<script lang="ts" setup>
import { motion } from 'motion-v'
import { isYoutubeStorageKey } from '~~/shared/utils/youtube'

const route = useRoute()
const router = useRouter()
const dayjs = useDayjs()

const albumId = computed(() => {
  const id = route.params.albumId as string
  return parseInt(id, 10)
})

const {
  data: album,
  error,
  pending,
} = await useFetch(() => `/api/albums/${albumId.value}`, {
  watch: [albumId],
})

if (error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Album not found',
  })
}

const albumData = computed(() => album.value)

const albumStats = computed(() => {
  if (!albumData.value) return null

  const photos = albumData.value.photos || []
  const totalPhotos = photos.length
  const photosWithDates = photos.filter((p: any) => p.dateTaken).length
  const photosWithExif = photos.filter((p: any) => p.exif).length

  const allDates = photos
    .map((p: any) => p?.dateTaken)
    .filter((date: any): date is string => Boolean(date))
    .map((date: string) => dayjs(date))
    .sort((a, b) => (a.isBefore(b) ? -1 : 1))

  const dateRange =
    allDates.length > 0
      ? {
          start: allDates[0],
          end: allDates[allDates.length - 1],
        }
      : null

  return {
    total: totalPhotos,
    withDates: photosWithDates,
    withExif: photosWithExif,
    dateRange,
  }
})

// 计算日期范围文本
const dateRangeText = computed(() => {
  const range = albumStats.value?.dateRange
  if (!range || !range.start || !range.end) return null

  if (range.start.isSame(range.end, 'day')) {
    return range.start.format('ll')
  } else if (range.start.isSame(range.end, 'month')) {
    return range.start.format('MMM YYYY')
  } else if (range.start.isSame(range.end, 'year')) {
    return `${range.start.format('MMM')} - ${range.end.format('MMM YYYY')}`
  } else {
    return `${range.start.format('ll')} - ${range.end.format('ll')}`
  }
})

const albumGridItems = computed(() => {
  return (
    albumData.value?.photos?.map((photo: any, index: number) => ({
      id: photo.id,
      photo,
      originalIndex: index,
    })) ?? []
  )
})

const handleOpenViewer = (index: number) => {
  const photos = albumData.value?.photos
  if (photos && photos[index]) {
    const { openViewer } = useViewerState()
    const albumRoute = `/albums/${albumId.value}`
    openViewer(0, albumRoute)
    router.push(`/${photos[index].id}`)
  }
}

const coverPhoto = computed(() => {
  const album = albumData.value
  if (!album?.photos) return null

  // coverPhotoId first
  if (album.coverPhotoId) {
    const cover = album.photos.find((p: any) => p.id === album.coverPhotoId)
    if (cover) return cover
  }

  // otherwise first photo
  return album.photos[0] || null
})

const coverDateDisplay = computed(() => {
  const range = albumStats.value?.dateRange
  if (range?.start && range?.end) {
    if (range.start.isSame(range.end, 'day')) {
      return range.start.format('MMM DD').toUpperCase()
    }

    return `${range.start.format('MMM DD').toUpperCase()} - ${range.end.format('MMM DD').toUpperCase()}`
  }

  if (albumData.value?.createdAt) {
    return dayjs(albumData.value.createdAt).format('MMM DD').toUpperCase()
  }

  return ''
})

const coverInfoTitle = computed(() => {
  return coverPhoto.value?.title || albumData.value?.title || 'Album'
})

const coverPhotoCount = computed(() => {
  return albumStats.value?.total || 0
})

const getAlbumGridItemClass = (index: number) => {
  const patternIndex = index % 6

  if (patternIndex === 2) {
    return 'album-grid-item--tall'
  }

  return 'album-grid-item--standard'
}

const isYoutubePhoto = (photo?: { storageKey?: string | null } | null) =>
  isYoutubeStorageKey(photo?.storageKey)

const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  })
}

const showFloatingActions = ref(false)

const handleScroll = () => {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  showFloatingActions.value = scrollTop > 500
}

const goBackToAlbums = () => {
  router.push('/albums')
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

onBeforeMount(() => {
  useHead({
    title: albumData.value ? albumData.value.title : 'Album Not Found',
  })
})
</script>

<template>
  <div class="relative w-full">
    <div
      v-if="pending"
      class="flex flex-col items-center justify-center min-h-[50vh] gap-4"
    >
      <UIcon
        name="tabler:loader"
        class="animate-spin size-8 text-primary-600"
      />
      <p class="text-sm text-neutral-600 dark:text-neutral-400">
        {{ $t('ui.loading') }}
      </p>
    </div>

    <template v-else-if="albumData">
      <motion.section
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :transition="{ duration: 0.45 }"
        class="relative bg-black"
      >
        <div class="relative min-h-[78svh] overflow-hidden sm:min-h-[84svh]">
          <ThumbImage
            v-if="coverPhoto"
            :src="coverPhoto.thumbnailUrl || coverPhoto.originalUrl || ''"
            :thumbhash="coverPhoto.thumbnailHash"
            :alt="albumData.title"
            class="absolute inset-0 h-full w-full object-cover"
          />
          <div class="absolute inset-0 bg-black/28" />
          <div
            class="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/35"
          />
          <div
            class="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/55 to-transparent"
          />

          <div
            class="relative z-10 flex min-h-[78svh] flex-col px-4 py-4 sm:min-h-[84svh] sm:px-8 sm:py-6"
          >
            <div class="flex items-start justify-between gap-4">
              <UButton
                variant="ghost"
                color="neutral"
                icon="tabler:arrow-left"
                size="sm"
                class="rounded-full border border-white/20 bg-black/15 text-white backdrop-blur-md hover:bg-black/25"
                @click="goBackToAlbums"
              />
            </div>

            <div
              class="mt-auto flex flex-col items-center justify-end pb-14 text-center sm:pb-22"
            >
              <p
                v-if="albumData.description"
                class="mb-5 max-w-2xl text-xs uppercase tracking-[0.38em] text-white/72 sm:text-sm"
              >
                {{ albumData.description }}
              </p>

              <h1
                class="album-cover-title max-w-5xl text-4xl uppercase text-white sm:text-6xl lg:text-7xl"
              >
                {{ albumData.title }}
              </h1>
            </div>
          </div>
        </div>

        <div class="bg-white text-neutral-500">
          <div
            class="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-8 lg:px-10"
          >
            <div
              class="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left"
            >
              <div class="flex items-center gap-2 text-neutral-400">
                <div
                  class="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300 text-sm font-semibold tracking-[0.28em]"
                >
                  CF
                </div>
                <div class="text-xs uppercase tracking-[0.28em]">
                  <p>Chronoframe</p>
                  <p>Gallery</p>
                </div>
              </div>

              <div
                class="flex flex-wrap items-center justify-center gap-3 text-neutral-500 lg:justify-start"
              >
                <div class="album-cover-social">
                  <Icon name="tabler:world" />
                </div>
                <div class="album-cover-social">
                  <Icon name="tabler:brand-facebook-filled" />
                </div>
                <div class="album-cover-social">
                  <Icon name="tabler:brand-instagram" />
                </div>
                <div class="album-cover-social">
                  <Icon name="tabler:brand-youtube-filled" />
                </div>
                <div class="album-cover-social">
                  <Icon name="tabler:brand-vimeo-filled" />
                </div>
                <div class="album-cover-social">
                  <Icon name="tabler:brand-linkedin" />
                </div>
                <div class="album-cover-social">
                  <Icon name="tabler:brand-x" />
                </div>
              </div>
            </div>

            <div class="text-center">
              <h2
                class="album-cover-heading text-3xl uppercase text-neutral-400 sm:text-5xl"
              >
                {{ albumData.title }}
              </h2>
            </div>

            <div
              class="flex flex-col items-center gap-2 text-center lg:items-end lg:text-right"
            >
              <p class="text-sm uppercase tracking-[0.18em] text-neutral-400">
                {{ coverDateDisplay }}
              </p>
              <div class="flex items-center gap-4 text-base text-neutral-400">
                <span class="flex items-center gap-1.5">
                  <Icon
                    name="tabler:photo"
                    class="size-4"
                  />
                  {{ coverPhotoCount }}
                </span>
                <span class="flex items-center gap-1.5">
                  <Icon
                    name="tabler:calendar-event"
                    class="size-4"
                  />
                  {{
                    dateRangeText || $dayjs(albumData.createdAt).format('ll')
                  }}
                </span>
              </div>
              <p class="max-w-sm text-sm text-neutral-500">
                {{ coverInfoTitle }}
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      <!-- Album Photo Grid -->
      <div class="mx-auto max-w-[1600px] px-2 py-2 sm:px-3 sm:py-3">
        <motion.div
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :transition="{ delay: 0.2, duration: 0.4 }"
        >
          <div
            v-if="albumStats?.total === 0"
            class="flex flex-col items-center justify-center gap-6 px-4"
          >
            <div class="flex flex-col items-center gap-4">
              <Icon
                name="tabler:library-photo"
                class="size-20 text-neutral-300 dark:text-neutral-600"
              />
              <div class="text-center">
                <p
                  class="text-xl font-normal text-neutral-800 dark:text-neutral-200 mb-2"
                >
                  {{ $t('album.emptyAlbumTitle') }}
                </p>
              </div>
            </div>
          </div>

          <div
            v-else
            class="album-photo-grid"
          >
            <button
              v-for="item in albumGridItems"
              :key="item.photo.id"
              type="button"
              class="album-grid-item group"
              :class="getAlbumGridItemClass(item.originalIndex)"
              @click="handleOpenViewer(item.originalIndex)"
            >
              <ThumbImage
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                :src="item.photo.thumbnailUrl || item.photo.originalUrl || ''"
                :thumbhash="item.photo.thumbnailHash"
                :alt="item.photo.title || albumData.title"
              />
              <div
                class="absolute inset-0 bg-gradient-to-t from-black/24 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
              <div
                class="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-white/18 bg-black/20 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white/88 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100"
              >
                <Icon
                  :name="
                    isYoutubePhoto(item.photo)
                      ? 'tabler:brand-youtube'
                      : 'tabler:photo'
                  "
                  class="size-3.5"
                />
                {{ item.originalIndex + 1 }}
              </div>
              <div
                v-if="isYoutubePhoto(item.photo)"
                class="absolute inset-0 flex items-center justify-center opacity-95 transition group-hover:scale-105"
              >
                <div
                  class="flex size-12 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-black/25"
                >
                  <Icon
                    name="tabler:player-play-filled"
                    class="size-6"
                  />
                </div>
              </div>
              <div
                class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              >
                <div class="min-w-0 text-left">
                  <p class="truncate text-sm font-medium">
                    {{ item.photo.title || albumData.title }}
                  </p>
                  <p class="truncate text-xs text-white/70">
                    {{
                      item.photo.city ||
                      (item.photo.dateTaken
                        ? $dayjs(item.photo.dateTaken).format('ll')
                        : $dayjs(item.photo.createdAt).format('ll'))
                    }}
                  </p>
                </div>
                <Icon
                  name="tabler:arrows-diagonal"
                  class="size-4 shrink-0 text-white/80"
                />
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-col items-center justify-center min-h-[50vh] gap-6">
        <div class="flex flex-col items-center gap-4">
          <Icon
            name="tabler:alert-circle"
            class="size-20 text-red-400"
          />
          <div class="text-center">
            <p
              class="text-2xl font-semibold text-neutral-800 dark:text-neutral-200 mb-2"
            >
              {{ $t('album.failedToLoadTitle') }}
            </p>
            <p
              class="text-base text-neutral-600 dark:text-neutral-400 max-w-md"
            >
              {{ $t('album.failedToLoadDescription') }}
            </p>
          </div>
        </div>
        <UButton @click="goBackToAlbums">
          {{ $t('album.backToAlbums') }}
        </UButton>
      </div>
    </template>

    <!-- Back to Top Button -->
    <motion.div
      v-if="showFloatingActions"
      class="fixed bottom-6 right-6 z-50"
      :initial="{ opacity: 0, scale: 0.8 }"
      :animate="{ opacity: 1, scale: 1 }"
      :exit="{ opacity: 0, scale: 0.8 }"
      :transition="{ duration: 0.2 }"
    >
      <UTooltip :text="$t('ui.action.backtotop.tooltip') || '回到顶部'">
        <UButton
          variant="soft"
          color="neutral"
          class="cursor-pointer bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm flex justify-center items-center rounded-full shadow-lg hover:bg-white dark:hover:bg-neutral-800 transition-all duration-300 border border-neutral-200/50 dark:border-neutral-700/50"
          icon="tabler:arrow-up"
          size="lg"
          :aria-label="$t('ui.action.backtotop.ariaLabel') || '回到顶部'"
          @click="scrollToTop"
        />
      </UTooltip>
    </motion.div>
  </div>
</template>

<style scoped>
.album-cover-title,
.album-cover-heading {
  font-family: 'Baskerville', 'Times New Roman', serif;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-wrap: balance;
}

.album-cover-title {
  line-height: 0.95;
  text-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
}

.album-cover-heading {
  letter-spacing: 0.04em;
}

.album-cover-social {
  display: flex;
  height: 1.9rem;
  width: 1.9rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1px solid rgba(163, 163, 163, 0.65);
  font-size: 0.92rem;
}

.album-photo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  grid-auto-flow: dense;
  grid-auto-rows: 10rem;
}

.album-grid-item {
  position: relative;
  overflow: hidden;
  background: rgba(23, 23, 23, 0.08);
  min-height: 0;
}

.album-grid-item--standard {
  grid-row: span 2;
}

.album-grid-item--tall {
  grid-row: span 4;
}

@media (min-width: 768px) {
  .album-photo-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: 8.5rem;
    gap: 2px;
  }
}
</style>
