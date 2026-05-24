<script lang="ts" setup>
import type { Album, Photo, YoutubeVideo } from '~~/server/utils/db'
import type { FormSubmitEvent, FormError } from '@nuxt/ui'
import {
  getYoutubeThumbnailUrl,
  getYoutubeVideoId,
  getYoutubeWatchUrl,
} from '~~/shared/utils/youtube'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.albums'),
})

interface AlbumItem extends Album {
  photoCount?: number
  videoCount?: number
  photoIds?: string[]
  youtubeVideoIds?: number[]
  coverPhoto?: Photo | null
}

interface YoutubeVideoFormItem {
  youtubeId: string
  url: string
  title?: string | null
  thumbnailUrl: string
}

interface AlbumFormState {
  title: string
  description: string
  isHidden: boolean
  eventDate: string
}

type PhotoSelectorMode = 'photos' | 'cover'

const albums = ref<AlbumItem[]>([])
const isLoadingAlbums = ref(false)
const allPhotos = ref<Photo[]>([])
const isLoadingPhotos = ref(false)

const isAlbumSlideoverOpen = ref(false)
const isDeleteConfirmOpen = ref(false)
const isPhotoSelectorOpen = ref(false)
const photoSelectorMode = ref<PhotoSelectorMode>('photos')
const removePhotoTargetId = ref<string | null>(null)

const currentAlbum = ref<AlbumItem | null>(null)

const formData = reactive<AlbumFormState>({
  title: '',
  description: '',
  isHidden: false,
  eventDate: '',
})

const formRef = ref()
const isSubmittingForm = ref(false)

const selectedPhotoIds = ref<string[]>([])
const coverPhotoId = ref('')
const selectedYoutubeVideos = ref<YoutubeVideoFormItem[]>([])
const youtubeVideoUrl = ref('')
const youtubeVideoTitle = ref('')
const youtubeVideoThumbnailUrl = ref('')
const youtubeVideoError = ref('')

const draftSelectedPhotoIds = ref<string[]>([])
const draftCoverPhotoId = ref('')
const {
  filteredPhotos: unifiedFilteredPhotos,
  selectedCounts,
  hasActiveFilters,
  clearAllFilters,
} = usePhotoFilters()

const isSelectorFilterOpen = ref(false)

const totalSelectedFilters = computed(() => {
  return Object.values(selectedCounts.value).reduce(
    (total, count) => total + count,
    0,
  )
})

const isCoverSelectorMode = computed(() => photoSelectorMode.value === 'cover')
const isRemovePhotoConfirmOpen = computed({
  get: () => Boolean(removePhotoTargetId.value),
  set: (isOpen) => {
    if (!isOpen) {
      removePhotoTargetId.value = null
    }
  },
})

const validateForm = (state: any): FormError[] => {
  const errors: FormError[] = []
  if (!state.title?.trim()) {
    errors.push({
      name: 'title',
      message: $t('dashboard.albums.form.titleRequired'),
    })
  }
  return errors
}

const loadAlbums = async () => {
  isLoadingAlbums.value = true
  try {
    const response = await $fetch('/api/albums')
    albums.value = (response as any[]).map((album) => ({
      ...album,
      photoCount: album.photoIds?.length || 0,
      videoCount: album.youtubeVideoIds?.length || 0,
    }))

    for (const album of albums.value) {
      if (album.coverPhotoId && allPhotos.value.length > 0) {
        const coverPhoto = allPhotos.value.find(
          (p) => p.id === album.coverPhotoId,
        )
        if (coverPhoto) {
          album.coverPhoto = coverPhoto
        }
      }
    }
  } catch (error) {
    console.error('Failed to load albums:', error)
    useToast().add({
      title: $t('dashboard.albums.messages.loadError'),
      color: 'error',
    })
  } finally {
    isLoadingAlbums.value = false
  }
}

const loadPhotos = async () => {
  isLoadingPhotos.value = true
  try {
    const { photos } = usePhotos()
    allPhotos.value = photos.value
  } catch (error) {
    console.error('Failed to load photos:', error)
  } finally {
    isLoadingPhotos.value = false
  }
}

const openCreateSlideover = () => {
  currentAlbum.value = null
  formData.title = ''
  formData.description = ''
  formData.isHidden = false
  formData.eventDate = ''
  selectedPhotoIds.value = []
  coverPhotoId.value = ''
  selectedYoutubeVideos.value = []
  youtubeVideoUrl.value = ''
  youtubeVideoTitle.value = ''
  youtubeVideoThumbnailUrl.value = ''
  youtubeVideoError.value = ''
  formRef.value?.clear()
  isAlbumSlideoverOpen.value = true
}

const openEditSlideover = async (album: AlbumItem) => {
  currentAlbum.value = album
  try {
    const albumDetail = (await $fetch(`/api/albums/${album.id}`)) as any
    formData.title = album.title
    formData.description = album.description || ''
    formData.isHidden = album.isHidden || false
    formData.eventDate = albumDetail.eventDate || album.eventDate || ''
    selectedPhotoIds.value = (albumDetail.photos || []).map((p: Photo) => p.id)
    selectedYoutubeVideos.value = (albumDetail.youtubeVideos || []).map(
      (video: YoutubeVideo) => ({
        youtubeId: video.youtubeId,
        url: video.url,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
      }),
    )
    youtubeVideoUrl.value = ''
    youtubeVideoTitle.value = ''
    youtubeVideoThumbnailUrl.value = ''
    youtubeVideoError.value = ''
    coverPhotoId.value = album.coverPhotoId || ''
    formRef.value?.clear()
  } catch (error) {
    console.error('Failed to load album details:', error)
    useToast().add({
      title: $t('dashboard.albums.messages.loadDetailError'),
      color: 'error',
    })
  }
  isAlbumSlideoverOpen.value = true
}

const openDeleteConfirm = (album: AlbumItem) => {
  currentAlbum.value = album
  isDeleteConfirmOpen.value = true
}

const onFormSubmit = async (event: FormSubmitEvent<AlbumFormState>) => {
  isSubmittingForm.value = true
  try {
    if (currentAlbum.value) {
      await $fetch(`/api/albums/${currentAlbum.value.id}`, {
        method: 'PUT',
        body: {
          title: event.data.title,
          description: event.data.description || undefined,
          coverPhotoId: coverPhotoId.value || undefined,
          photoIds: selectedPhotoIds.value,
          isHidden: event.data.isHidden,
          eventDate: event.data.eventDate || null,
          youtubeVideos: selectedYoutubeVideos.value.map((video) => ({
            url: video.url,
            title: video.title || undefined,
            thumbnailUrl: video.thumbnailUrl || undefined,
          })),
        },
      })

      useToast().add({
        title: $t('dashboard.albums.messages.updateSuccess'),
        color: 'success',
      })

      isAlbumSlideoverOpen.value = false
    } else {
      await $fetch('/api/albums', {
        method: 'POST',
        body: {
          title: event.data.title,
          description: event.data.description || undefined,
          coverPhotoId: coverPhotoId.value || undefined,
          photoIds: selectedPhotoIds.value,
          isHidden: event.data.isHidden,
          eventDate: event.data.eventDate || null,
          youtubeVideos: selectedYoutubeVideos.value.map((video) => ({
            url: video.url,
            title: video.title || undefined,
            thumbnailUrl: video.thumbnailUrl || undefined,
          })),
        },
      })

      useToast().add({
        title: $t('dashboard.albums.messages.createSuccess'),
        color: 'success',
      })

      isAlbumSlideoverOpen.value = false
    }

    await loadAlbums()
  } catch (error) {
    console.error('Failed to save album:', error)
    useToast().add({
      title: currentAlbum.value
        ? $t('dashboard.albums.messages.updateError')
        : $t('dashboard.albums.messages.createError'),
      color: 'error',
    })
  } finally {
    isSubmittingForm.value = false
  }
}

const deleteAlbum = async () => {
  if (!currentAlbum.value) return

  try {
    await $fetch(`/api/albums/${currentAlbum.value.id}`, {
      method: 'DELETE',
    })

    useToast().add({
      title: $t('dashboard.albums.messages.deleteSuccess'),
      color: 'success',
    })

    isDeleteConfirmOpen.value = false
    await loadAlbums()
  } catch (error) {
    console.error('Failed to delete album:', error)
    useToast().add({
      title: $t('dashboard.albums.messages.deleteError'),
      color: 'error',
    })
  }
}

const openRemoveSelectedPhotoConfirm = (photoId: string) => {
  removePhotoTargetId.value = photoId
}

const removeSelectedPhotoFromAlbum = () => {
  const photoId = removePhotoTargetId.value
  if (!photoId) return

  selectedPhotoIds.value = selectedPhotoIds.value.filter((id) => id !== photoId)
  if (coverPhotoId.value === photoId) {
    coverPhotoId.value = ''
  }
  removePhotoTargetId.value = null
}

const movePhotoId = (
  photoIds: string[],
  draggedPhotoId: string,
  targetPhotoId: string,
) => {
  if (draggedPhotoId === targetPhotoId) {
    return photoIds
  }

  const nextPhotoIds = [...photoIds]
  const fromIndex = nextPhotoIds.indexOf(draggedPhotoId)
  const toIndex = nextPhotoIds.indexOf(targetPhotoId)

  if (fromIndex === -1 || toIndex === -1) {
    return photoIds
  }

  const [movedPhotoId] = nextPhotoIds.splice(fromIndex, 1)
  if (!movedPhotoId) {
    return photoIds
  }

  nextPhotoIds.splice(toIndex, 0, movedPhotoId)
  return nextPhotoIds
}

const draggedSelectedPhotoId = ref<string | null>(null)
const dragOverSelectedPhotoId = ref<string | null>(null)
const draggedDraftPhotoId = ref<string | null>(null)
const dragOverDraftPhotoId = ref<string | null>(null)

const handleSelectedPhotoDragStart = (photoId: string) => {
  draggedSelectedPhotoId.value = photoId
}

const handleSelectedPhotoDrop = (targetPhotoId: string) => {
  if (!draggedSelectedPhotoId.value) {
    return
  }

  selectedPhotoIds.value = movePhotoId(
    selectedPhotoIds.value,
    draggedSelectedPhotoId.value,
    targetPhotoId,
  )
  draggedSelectedPhotoId.value = null
  dragOverSelectedPhotoId.value = null
}

const handleSelectedPhotoDragEnd = () => {
  draggedSelectedPhotoId.value = null
  dragOverSelectedPhotoId.value = null
}

const handleDraftPhotoDragStart = (photoId: string) => {
  draggedDraftPhotoId.value = photoId
}

const handleDraftPhotoDrop = (targetPhotoId: string) => {
  if (!draggedDraftPhotoId.value) {
    return
  }

  draftSelectedPhotoIds.value = movePhotoId(
    draftSelectedPhotoIds.value,
    draggedDraftPhotoId.value,
    targetPhotoId,
  )
  draggedDraftPhotoId.value = null
  dragOverDraftPhotoId.value = null
}

const handleDraftPhotoDragEnd = () => {
  draggedDraftPhotoId.value = null
  dragOverDraftPhotoId.value = null
}

const clearSelectedPhotos = () => {
  selectedPhotoIds.value = []
  coverPhotoId.value = ''
}

const addYoutubeVideo = () => {
  youtubeVideoError.value = ''
  const youtubeId = getYoutubeVideoId(youtubeVideoUrl.value)

  if (!youtubeId) {
    youtubeVideoError.value = $t('dashboard.albums.form.invalidYoutubeUrl')
    return
  }

  if (
    selectedYoutubeVideos.value.some((video) => video.youtubeId === youtubeId)
  ) {
    youtubeVideoError.value = $t('dashboard.albums.form.duplicateYoutubeVideo')
    return
  }

  selectedYoutubeVideos.value.push({
    youtubeId,
    url: getYoutubeWatchUrl(youtubeId),
    title: youtubeVideoTitle.value.trim() || null,
    thumbnailUrl:
      youtubeVideoThumbnailUrl.value.trim() ||
      getYoutubeThumbnailUrl(youtubeId),
  })
  youtubeVideoUrl.value = ''
  youtubeVideoTitle.value = ''
  youtubeVideoThumbnailUrl.value = ''
}

const removeYoutubeVideo = (youtubeId: string) => {
  selectedYoutubeVideos.value = selectedYoutubeVideos.value.filter(
    (video) => video.youtubeId !== youtubeId,
  )
}

const openPhotoSelector = (mode: PhotoSelectorMode = 'photos') => {
  photoSelectorMode.value = mode
  draftSelectedPhotoIds.value = [...selectedPhotoIds.value]
  draftCoverPhotoId.value =
    coverPhotoId.value && selectedPhotoIds.value.includes(coverPhotoId.value)
      ? coverPhotoId.value
      : ''
  isSelectorFilterOpen.value = false
  isPhotoSelectorOpen.value = true
}

const closePhotoSelector = () => {
  isSelectorFilterOpen.value = false
  isPhotoSelectorOpen.value = false
}

const confirmPhotoSelection = () => {
  if (isCoverSelectorMode.value) {
    coverPhotoId.value = selectedPhotoIds.value.includes(
      draftCoverPhotoId.value,
    )
      ? draftCoverPhotoId.value
      : ''
    isPhotoSelectorOpen.value = false
    return
  }

  selectedPhotoIds.value = [...draftSelectedPhotoIds.value]
  coverPhotoId.value = draftSelectedPhotoIds.value.includes(
    draftCoverPhotoId.value,
  )
    ? draftCoverPhotoId.value
    : ''
  isPhotoSelectorOpen.value = false
}

const toggleDraftPhotoSelection = (photoId: string) => {
  if (isCoverSelectorMode.value) {
    setDraftCoverPhoto(photoId)
    return
  }

  const index = draftSelectedPhotoIds.value.indexOf(photoId)
  if (index > -1) {
    draftSelectedPhotoIds.value.splice(index, 1)
    if (draftCoverPhotoId.value === photoId) {
      draftCoverPhotoId.value = ''
    }
    return
  }

  draftSelectedPhotoIds.value.push(photoId)
}

const setDraftCoverPhoto = (photoId: string) => {
  if (isCoverSelectorMode.value) {
    if (selectedPhotoIds.value.includes(photoId)) {
      draftCoverPhotoId.value = photoId
    }
    return
  }

  if (!draftSelectedPhotoIds.value.includes(photoId)) {
    draftSelectedPhotoIds.value.push(photoId)
  }
  draftCoverPhotoId.value = photoId
}

const getDraftPhotoOrder = (photoId: string) => {
  const index = draftSelectedPhotoIds.value.indexOf(photoId)
  return index >= 0 ? index + 1 : null
}

const areAllFilteredPhotosSelected = computed(() => {
  return (
    selectorFilteredPhotos.value.length > 0 &&
    selectorFilteredPhotos.value.every((photo) =>
      draftSelectedPhotoIds.value.includes(photo.id),
    )
  )
})

const areSomeFilteredPhotosSelected = computed(() => {
  const selectedInFiltered = selectorFilteredPhotos.value.filter((photo) =>
    draftSelectedPhotoIds.value.includes(photo.id),
  ).length
  return (
    selectedInFiltered > 0 &&
    selectedInFiltered < selectorFilteredPhotos.value.length
  )
})

const toggleAllFilteredPhotos = () => {
  if (isCoverSelectorMode.value) {
    return
  }

  if (areAllFilteredPhotosSelected.value) {
    draftSelectedPhotoIds.value = draftSelectedPhotoIds.value.filter(
      (id) => !selectorFilteredPhotos.value.some((photo) => photo.id === id),
    )
    if (
      draftCoverPhotoId.value &&
      !draftSelectedPhotoIds.value.includes(draftCoverPhotoId.value)
    ) {
      draftCoverPhotoId.value = ''
    }
    return
  }

  const merged = new Set(draftSelectedPhotoIds.value)
  for (const photo of selectorFilteredPhotos.value) {
    merged.add(photo.id)
  }
  draftSelectedPhotoIds.value = [...merged]
}

const selectorSourcePhotos = computed(() => {
  if (!isCoverSelectorMode.value) {
    return allPhotos.value
  }

  return selectedPhotoIds.value
    .map((id) => allPhotos.value.find((photo) => photo.id === id))
    .filter((photo): photo is Photo => Boolean(photo))
})

const selectorFilteredPhotos = computed(() => {
  if (selectorSourcePhotos.value.length === 0) return []

  if (isCoverSelectorMode.value) {
    return selectorSourcePhotos.value
  }

  const ids = new Set(selectorSourcePhotos.value.map((photo) => photo.id))
  return unifiedFilteredPhotos.value.filter((photo) => ids.has(photo.id))
})

const selectedPhotosPreview = computed(() => {
  return draftSelectedPhotoIds.value
    .map((id) => allPhotos.value.find((photo) => photo.id === id))
    .filter((photo): photo is Photo => Boolean(photo))
    .slice(0, 8)
})

const selectedPhotosOverflowCount = computed(() => {
  return Math.max(
    draftSelectedPhotoIds.value.length - selectedPhotosPreview.value.length,
    0,
  )
})

onMounted(async () => {
  await Promise.all([loadPhotos(), loadAlbums()])
})

const dayjs = useDayjs()

const slideoverTitle = computed(() => {
  return currentAlbum.value
    ? $t('dashboard.albums.slideover.edit.title')
    : $t('dashboard.albums.slideover.create.title')
})

const slideoverDescription = computed(() => {
  return currentAlbum.value
    ? $t('dashboard.albums.slideover.edit.description')
    : $t('dashboard.albums.slideover.create.description')
})

const submitButtonLabel = computed(() => {
  return currentAlbum.value
    ? $t('dashboard.albums.slideover.submitEdit')
    : $t('dashboard.albums.slideover.submitCreate')
})

const columns: any[] = [
  {
    id: 'coverPhoto',
    accessorKey: 'coverPhoto',
    header: $t('dashboard.albums.table.columns.cover'),
  },
  {
    id: 'title',
    accessorKey: 'title',
    header: $t('dashboard.albums.table.columns.title'),
  },
  {
    id: 'description',
    accessorKey: 'description',
    header: $t('dashboard.albums.table.columns.description'),
  },
  {
    id: 'photoCount',
    accessorKey: 'photoCount',
    header: $t('dashboard.albums.table.columns.photoCount'),
  },
  {
    id: 'videoCount',
    accessorKey: 'videoCount',
    header: $t('dashboard.albums.table.columns.videoCount'),
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: $t('dashboard.albums.table.columns.createdAt'),
  },
  {
    id: 'actions',
    header: $t('dashboard.albums.table.columns.actions'),
  },
]
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.albums')">
        <template #right>
          <UButton
            icon="tabler:plus"
            variant="soft"
            @click="openCreateSlideover"
          >
            {{ $t('dashboard.albums.createButton') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-6">
        <div
          v-if="albums.length > 0"
          class="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800"
        >
          <UTable
            :data="albums"
            :columns="columns"
          >
            <template #coverPhoto-cell="{ row }">
              <div
                class="w-16 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-neutral-800 shrink-0"
              >
                <img
                  v-if="(row.original as unknown as AlbumItem).coverPhoto"
                  :src="
                    (row.original as unknown as AlbumItem).coverPhoto
                      ?.thumbnailUrl || ''
                  "
                  :alt="(row.original as unknown as AlbumItem).title"
                  class="w-full h-full object-cover"
                />
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600"
                >
                  <Icon
                    name="tabler:image"
                    size="20"
                  />
                </div>
              </div>
            </template>

            <template #title-cell="{ row }">
              <NuxtLink
                :to="`/albums/${(row.original as unknown as AlbumItem).id}`"
                target="_blank"
                class="font-medium text-primary-600 dark:text-primary-400 hover:underline cursor-pointer inline-flex items-center gap-2"
              >
                {{ (row.original as unknown as AlbumItem).title }}
                <Icon
                  name="tabler:external-link"
                  size="16"
                  class="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                />
              </NuxtLink>
            </template>

            <template #description-cell="{ row }">
              <div
                v-if="(row.original as unknown as AlbumItem).description"
                class="text-sm text-gray-600 dark:text-gray-400 line-clamp-1"
              >
                {{ (row.original as unknown as AlbumItem).description }}
              </div>
              <div
                v-else
                class="text-sm text-gray-400 dark:text-gray-600"
              >
                -
              </div>
            </template>

            <template #photoCount-cell="{ row }">
              <UBadge
                variant="soft"
                color="neutral"
              >
                {{
                  $t(
                    'album.photo',
                    {
                      count:
                        (row.original as unknown as AlbumItem).photoCount || 0,
                    },
                    (row.original as unknown as AlbumItem).photoCount || 0,
                  )
                }}
              </UBadge>
            </template>

            <template #videoCount-cell="{ row }">
              <UBadge
                variant="soft"
                color="neutral"
                icon="tabler:video"
              >
                {{ (row.original as unknown as AlbumItem).videoCount || 0 }}
              </UBadge>
            </template>

            <template #createdAt-cell="{ row }">
              <div class="text-sm text-gray-600 dark:text-gray-400">
                {{
                  dayjs(
                    (row.original as unknown as AlbumItem).createdAt,
                  ).format('YYYY-MM-DD')
                }}
              </div>
            </template>

            <template #actions-cell="{ row }">
              <div class="flex gap-1">
                <UButton
                  variant="ghost"
                  color="primary"
                  size="xs"
                  icon="tabler:edit"
                  @click="
                    openEditSlideover(row.original as unknown as AlbumItem)
                  "
                />
                <UButton
                  variant="ghost"
                  color="error"
                  size="xs"
                  icon="tabler:trash"
                  @click="
                    openDeleteConfirm(row.original as unknown as AlbumItem)
                  "
                />
              </div>
            </template>
          </UTable>
        </div>

        <div
          v-else-if="!isLoadingAlbums"
          class="flex flex-col items-center justify-center py-12 text-center"
        >
          <Icon
            name="tabler:album"
            size="48"
            class="text-gray-400 dark:text-gray-600 mb-4"
          />
          <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {{ $t('dashboard.albums.noAlbums') }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-4">
            {{ $t('dashboard.albums.noAlbumsTip') }}
          </p>
          <UButton
            icon="tabler:plus"
            @click="openCreateSlideover"
          >
            {{ $t('dashboard.albums.createButton') }}
          </UButton>
        </div>
        <div
          v-else
          class="flex items-center justify-center py-12"
        >
          <Icon
            name="tabler:loader"
            size="32"
            class="animate-spin text-primary-500"
          />
        </div>

        <USlideover
          v-model:open="isAlbumSlideoverOpen"
          :title="slideoverTitle"
          :description="slideoverDescription"
          :ui="{
            content: 'w-screen max-w-none sm:max-w-none',
            footer: 'justify-end',
            body: 'p-0 sm:p-0 space-y-4',
          }"
        >
          <template #body>
            <div class="mx-auto w-full max-w-2xl space-y-4 px-4 sm:px-6">
              <div class="space-y-3 pt-4">
                <div
                  v-if="coverPhotoId"
                  class="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-neutral-700 dark:bg-neutral-800"
                >
                  <div class="absolute left-3 top-3 z-10">
                    <UBadge
                      color="warning"
                      variant="solid"
                      icon="tabler:star-filled"
                    >
                      Album cover
                    </UBadge>
                  </div>

                  <ThumbImage
                    :src="
                      allPhotos.find((p) => p.id === coverPhotoId)
                        ?.thumbnailUrl || ''
                    "
                    :alt="coverPhotoId"
                    class="h-48 w-full object-cover"
                  />
                </div>

                <div
                  v-else
                  class="flex h-32 w-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-500 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-gray-400"
                >
                  <Icon
                    name="tabler:photo"
                    size="32"
                    class="mb-2"
                  />
                  <p class="text-sm font-medium">No cover image selected</p>
                </div>

                <div class="flex flex-wrap gap-2">
                  <UButton
                    variant="outline"
                    color="neutral"
                    icon="tabler:photo-star"
                    @click="openPhotoSelector('cover')"
                  >
                    {{
                      coverPhotoId ? 'Change cover image' : 'Choose cover image'
                    }}
                  </UButton>

                  <UButton
                    v-if="coverPhotoId"
                    variant="ghost"
                    color="neutral"
                    icon="tabler:trash"
                    @click="coverPhotoId = ''"
                  >
                    Remove cover
                  </UButton>
                </div>

                <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Pick a photo for the album cover. In the photo picker, use the
                  star button on any selected photo to mark it as the cover.
                </p>
              </div>

              <UForm
                ref="formRef"
                :state="formData"
                :validate="validateForm"
                class="space-y-4"
                @submit="onFormSubmit"
              >
                <UFormField
                  :label="$t('dashboard.albums.form.title')"
                  name="title"
                  required
                >
                  <UInput
                    v-model="formData.title"
                    class="w-full"
                    :placeholder="$t('dashboard.albums.form.titlePlaceholder')"
                  />
                </UFormField>

                <UFormField
                  :label="$t('dashboard.albums.form.description')"
                  name="description"
                >
                  <UTextarea
                    v-model="formData.description"
                    class="w-full"
                    :placeholder="
                      $t('dashboard.albums.form.descriptionPlaceholder')
                    "
                    :rows="3"
                  />
                </UFormField>

                <UFormField
                  :label="$t('dashboard.albums.form.eventDate')"
                  name="eventDate"
                >
                  <UInput
                    v-model="formData.eventDate"
                    class="w-full"
                    type="date"
                    :placeholder="
                      $t('dashboard.albums.form.eventDatePlaceholder')
                    "
                  />
                </UFormField>

                <UFormField
                  :label="$t('dashboard.albums.form.isHidden')"
                  name="isHidden"
                  :hint="$t('dashboard.albums.form.isHiddenHint')"
                >
                  <UCheckbox
                    v-model="formData.isHidden"
                    :label="$t('dashboard.albums.form.isHidden')"
                  />
                </UFormField>
              </UForm>

              <!-- 照片选择部分 -->
              <div class="space-y-3">
                <UButton
                  variant="outline"
                  color="primary"
                  icon="tabler:photo-plus"
                  size="lg"
                  class="w-full"
                  @click="openPhotoSelector"
                >
                  {{
                    selectedPhotoIds.length > 0
                      ? $t('dashboard.albums.form.editPhotos')
                      : $t('dashboard.albums.form.selectPhotos')
                  }}
                </UButton>

                <div
                  v-if="selectedPhotoIds.length > 0"
                  class="space-y-2"
                >
                  <div class="flex items-center justify-between">
                    <label
                      class="text-sm font-medium text-gray-700 dark:text-gray-300"
                      >{{
                        $t('dashboard.albums.form.selectedCount', {
                          count: selectedPhotoIds.length,
                        })
                      }}</label
                    >
                    <UButton
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      icon="tabler:trash"
                      @click="clearSelectedPhotos"
                    >
                      {{ $t('dashboard.albums.form.clearAll') }}
                    </UButton>
                  </div>

                  <div
                    class="grid grid-cols-4 gap-2 p-3 bg-gray-50 dark:bg-neutral-800/50 rounded-lg border border-gray-200 dark:border-neutral-700"
                  >
                    <div
                      v-for="photoId in selectedPhotoIds"
                      :key="photoId"
                      draggable="true"
                      class="relative group aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-neutral-700 cursor-grab active:cursor-grabbing transition"
                      :class="
                        dragOverSelectedPhotoId === photoId
                          ? 'ring-2 ring-primary-400 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900'
                          : ''
                      "
                      @dragstart="handleSelectedPhotoDragStart(photoId)"
                      @dragover.prevent="dragOverSelectedPhotoId = photoId"
                      @dragenter.prevent="dragOverSelectedPhotoId = photoId"
                      @drop.prevent="handleSelectedPhotoDrop(photoId)"
                      @dragend="handleSelectedPhotoDragEnd"
                    >
                      <img
                        :src="
                          allPhotos.find((p) => p.id === photoId)
                            ?.thumbnailUrl || ''
                        "
                        :alt="photoId"
                        class="w-full h-full object-cover"
                      />

                      <div
                        v-if="coverPhotoId === photoId"
                        class="absolute top-1 left-1 bg-primary-500 text-white px-1.5 py-0.5 rounded text-xs font-medium"
                      >
                        {{ $t('dashboard.albums.modal.setCover') }}
                      </div>

                      <button
                        type="button"
                        class="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-100 shadow-sm transition hover:bg-error-500 sm:opacity-0 sm:group-hover:opacity-100"
                        :aria-label="
                          $t('dashboard.albums.photoRemove.ariaLabel')
                        "
                        @click.stop="openRemoveSelectedPhotoConfirm(photoId)"
                      >
                        <Icon
                          name="tabler:trash"
                          size="14"
                        />
                      </button>

                    </div>
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <div class="flex items-center justify-between gap-2">
                  <h3
                    class="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {{ $t('dashboard.albums.form.youtubeVideos') }}
                  </h3>
                  <UBadge
                    v-if="selectedYoutubeVideos.length > 0"
                    variant="soft"
                    color="neutral"
                    icon="tabler:video"
                  >
                    {{
                      $t('dashboard.albums.form.selectedVideoCount', {
                        count: selectedYoutubeVideos.length,
                      })
                    }}
                  </UBadge>
                </div>

                <div class="grid gap-2">
                  <UInput
                    v-model="youtubeVideoUrl"
                    icon="tabler:brand-youtube"
                    :placeholder="
                      $t('dashboard.albums.form.youtubeUrlPlaceholder')
                    "
                    @keyup.enter="addYoutubeVideo"
                  />
                  <UInput
                    v-model="youtubeVideoTitle"
                    :placeholder="
                      $t('dashboard.albums.form.youtubeTitlePlaceholder')
                    "
                    @keyup.enter="addYoutubeVideo"
                  />
                  <UInput
                    v-model="youtubeVideoThumbnailUrl"
                    icon="tabler:photo"
                    :placeholder="
                      $t('dashboard.albums.form.youtubeThumbnailPlaceholder')
                    "
                    @keyup.enter="addYoutubeVideo"
                  />
                  <UButton
                    icon="tabler:plus"
                    color="primary"
                    class="justify-center"
                    @click="addYoutubeVideo"
                  >
                    {{ $t('dashboard.albums.form.addYoutubeVideo') }}
                  </UButton>
                </div>

                <p
                  v-if="youtubeVideoError"
                  class="text-xs text-error-500"
                >
                  {{ youtubeVideoError }}
                </p>

                <div
                  v-if="selectedYoutubeVideos.length > 0"
                  class="space-y-2"
                >
                  <div
                    v-for="video in selectedYoutubeVideos"
                    :key="video.youtubeId"
                    class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/60"
                  >
                    <img
                      :src="video.thumbnailUrl"
                      :alt="video.title || video.youtubeId"
                      class="h-14 w-24 shrink-0 rounded-md object-cover"
                    />
                    <div class="min-w-0 flex-1">
                      <p
                        class="truncate text-sm font-medium text-gray-800 dark:text-gray-100"
                      >
                        {{ video.title || video.url }}
                      </p>
                      <p
                        class="truncate text-xs text-gray-500 dark:text-gray-400"
                      >
                        {{ video.url }}
                      </p>
                    </div>
                    <UButton
                      variant="ghost"
                      color="neutral"
                      icon="tabler:trash"
                      :aria-label="
                        $t('dashboard.albums.form.removeYoutubeVideo')
                      "
                      @click="removeYoutubeVideo(video.youtubeId)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template #footer="{ close }">
            <UButton
              variant="ghost"
              color="neutral"
              @click="close"
            >
              {{ $t('dashboard.albums.slideover.cancel') }}
            </UButton>
            <UButton
              icon="tabler:check"
              :loading="isSubmittingForm"
              @click="formRef?.submit()"
            >
              {{ submitButtonLabel }}
            </UButton>
          </template>
        </USlideover>

        <UModal
          v-model:open="isPhotoSelectorOpen"
          portal
          scrollable
          :ui="{
            wrapper: 'z-220',
            overlay: 'z-220',
            content: 'z-221 w-full max-w-6xl overflow-hidden',
          }"
        >
          <template #content>
            <div class="flex h-[88vh] max-h-[88vh] flex-col">
              <div
                class="shrink-0 border-b border-gray-200 bg-white/80 p-4 backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/80 sm:p-5"
              >
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <h2 class="text-lg font-semibold sm:text-xl">
                      {{
                        isCoverSelectorMode
                          ? $t('dashboard.albums.modal.chooseCover')
                          : $t('dashboard.albums.modal.selectPhotos')
                      }}
                    </h2>
                  </div>
                  <UButton
                    icon="tabler:x"
                    color="neutral"
                    variant="ghost"
                    @click="closePhotoSelector"
                  />
                </div>

                <div class="mt-4 space-y-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <UPopover
                      v-if="!isCoverSelectorMode"
                      v-model:open="isSelectorFilterOpen"
                      :content="{
                        side: 'bottom',
                        align: 'start',
                        sideOffset: 8,
                      }"
                      :ui="{ content: 'z-230' }"
                    >
                      <UButton
                        icon="tabler:filter"
                        :color="hasActiveFilters ? 'info' : 'neutral'"
                        :variant="hasActiveFilters ? 'soft' : 'outline'"
                        size="sm"
                      >
                        {{ $t('ui.action.filter.title') }}
                        <UBadge
                          v-if="totalSelectedFilters > 0"
                          size="xs"
                          color="info"
                          variant="solid"
                          class="ml-1"
                        >
                          {{ totalSelectedFilters }}
                        </UBadge>
                      </UButton>

                      <template #content>
                        <UCard variant="glassmorphism">
                          <OverlayFilterPanel />
                        </UCard>
                      </template>
                    </UPopover>

                    <UButton
                      v-if="!isCoverSelectorMode && hasActiveFilters"
                      icon="tabler:filter-x"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      @click="clearAllFilters()"
                    >
                      {{ $t('ui.action.filter.clearAll') }}
                    </UButton>

                    <UButton
                      v-if="!isCoverSelectorMode"
                      color="neutral"
                      variant="soft"
                      size="sm"
                      class="justify-center"
                      :icon="
                        areAllFilteredPhotosSelected
                          ? 'tabler:checkbox'
                          : areSomeFilteredPhotosSelected
                            ? 'tabler:minus'
                            : 'tabler:square'
                      "
                      @click="toggleAllFilteredPhotos"
                    >
                      {{ $t('dashboard.albums.modal.selectAll') }}
                    </UButton>

                    <div class="ml-auto flex flex-wrap items-center gap-1.5">
                      <UBadge
                        v-if="!isCoverSelectorMode"
                        color="primary"
                        variant="soft"
                      >
                        {{
                          $t('dashboard.albums.modal.selectedPhotos', {
                            count: draftSelectedPhotoIds.length,
                          })
                        }}
                      </UBadge>
                      <UBadge
                        v-if="draftCoverPhotoId"
                        color="warning"
                        variant="soft"
                        icon="tabler:star-filled"
                      >
                        {{ $t('dashboard.albums.modal.coverSetInfo') }}
                      </UBadge>
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-if="!isCoverSelectorMode && selectedCounts.tags"
                      size="xs"
                      color="neutral"
                      variant="outline"
                    >
                      {{ $t('ui.action.filter.tabs.tags') }}:
                      {{ selectedCounts.tags }}
                    </UBadge>
                    <UBadge
                      v-if="!isCoverSelectorMode && selectedCounts.cameras"
                      size="xs"
                      color="neutral"
                      variant="outline"
                    >
                      {{ $t('ui.action.filter.tabs.cameras') }}:
                      {{ selectedCounts.cameras }}
                    </UBadge>
                    <UBadge
                      v-if="!isCoverSelectorMode && selectedCounts.lenses"
                      size="xs"
                      color="neutral"
                      variant="outline"
                    >
                      {{ $t('ui.action.filter.tabs.lenses') }}:
                      {{ selectedCounts.lenses }}
                    </UBadge>
                    <UBadge
                      v-if="!isCoverSelectorMode && selectedCounts.cities"
                      size="xs"
                      color="neutral"
                      variant="outline"
                    >
                      {{ $t('ui.action.filter.tabs.cities') }}:
                      {{ selectedCounts.cities }}
                    </UBadge>
                    <UBadge
                      v-if="!isCoverSelectorMode && selectedCounts.ratings"
                      size="xs"
                      color="neutral"
                      variant="outline"
                    >
                      {{ $t('ui.action.filter.tabs.ratings') }}
                    </UBadge>
                  </div>

                  <UCard
                    variant="subtle"
                    :ui="{
                      body: 'p-2 sm:p-2',
                    }"
                  >
                    <div>
                      <div
                        class="mb-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                      >
                        <Icon
                          name="tabler:star"
                          size="14"
                          class="text-warning-500"
                        />
                        <span>
                          {{
                            isCoverSelectorMode
                              ? $t('dashboard.albums.modal.chooseCoverHint')
                              : $t('dashboard.albums.modal.selectCoverHint')
                          }}
                        </span>
                      </div>
                      <div
                        v-if="selectedPhotosPreview.length > 0"
                        class="flex h-full items-center gap-2 overflow-x-auto"
                      >
                        <button
                          v-for="photo in selectedPhotosPreview"
                          :key="photo.id"
                          :draggable="!isCoverSelectorMode"
                          class="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 transition cursor-grab active:cursor-grabbing"
                          :class="
                            dragOverDraftPhotoId === photo.id
                              ? 'border-primary-400 ring-2 ring-primary-300/60'
                              : draftCoverPhotoId === photo.id
                                ? 'border-warning-500'
                                : 'border-transparent hover:border-gray-300 dark:hover:border-neutral-500'
                          "
                          @dragstart="handleDraftPhotoDragStart(photo.id)"
                          @dragover.prevent="dragOverDraftPhotoId = photo.id"
                          @dragenter.prevent="dragOverDraftPhotoId = photo.id"
                          @drop.prevent="handleDraftPhotoDrop(photo.id)"
                          @dragend="handleDraftPhotoDragEnd"
                          @click="setDraftCoverPhoto(photo.id)"
                        >
                          <ThumbImage
                            :src="photo.thumbnailUrl || ''"
                            :alt="photo.title || 'Photo'"
                            class="h-full w-full object-cover"
                          />
                          <div
                            v-if="!isCoverSelectorMode"
                            class="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/45 text-white"
                          >
                            <Icon
                              name="tabler:grip-vertical"
                              size="10"
                            />
                          </div>
                          <div
                            v-if="draftCoverPhotoId === photo.id"
                            class="absolute inset-x-0 bottom-0 flex items-center justify-center bg-warning-500/90 py-0.5"
                          >
                            <Icon
                              name="tabler:star-filled"
                              size="12"
                              class="text-white"
                            />
                          </div>
                        </button>

                        <UBadge
                          v-if="selectedPhotosOverflowCount > 0"
                          variant="soft"
                          color="neutral"
                          class="shrink-0"
                        >
                          +{{ selectedPhotosOverflowCount }}
                        </UBadge>
                      </div>
                      <div
                        v-else
                        class="flex h-full items-center"
                      >
                        <div
                          class="flex h-12 w-full items-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50/80 px-3 text-xs text-gray-600 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-gray-300"
                        >
                          <Icon
                            name="tabler:photo-plus"
                            size="14"
                            class="shrink-0 text-gray-500 dark:text-gray-400"
                          />
                          <span class="truncate">
                            {{
                              isCoverSelectorMode
                                ? $t('dashboard.albums.modal.noAlbumPhotos')
                                : $t('dashboard.albums.form.selectPhotos')
                            }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </UCard>
                </div>
              </div>

              <div class="flex-1 overflow-y-auto p-3 sm:p-5">
                <div
                  v-if="selectorFilteredPhotos.length > 0"
                  class="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5 xl:grid-cols-6"
                >
                  <button
                    v-for="photo in selectorFilteredPhotos"
                    :key="photo.id"
                    class="group text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60"
                    @click="toggleDraftPhotoSelection(photo.id)"
                  >
                    <div
                      class="relative aspect-square overflow-hidden rounded-lg border bg-gray-200/90 transition-all duration-200 dark:bg-neutral-700/80"
                      :class="
                        isCoverSelectorMode
                          ? draftCoverPhotoId === photo.id
                            ? 'border-warning-500 ring-1 ring-warning-300/60 dark:ring-warning-700/50'
                            : 'border-gray-200/70 hover:border-warning-300/90 dark:border-neutral-700 dark:hover:border-warning-500'
                          : draftSelectedPhotoIds.includes(photo.id)
                            ? 'border-primary-400 ring-1 ring-primary-300/60 dark:ring-primary-700/50'
                            : 'border-gray-200/70 hover:border-gray-300/90 dark:border-neutral-700 dark:hover:border-neutral-500'
                      "
                    >
                      <ThumbImage
                        :src="photo.thumbnailUrl || ''"
                        :alt="photo.title || 'Photo'"
                        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />

                      <div
                        class="absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-black/55 via-black/10 to-transparent"
                      />

                      <div
                        class="absolute inset-x-2 bottom-1.5 flex items-end justify-between gap-2"
                      >
                        <div class="min-w-0">
                          <p
                            class="truncate text-[10px] font-medium text-white/92"
                          >
                            {{ photo.title || photo.storageKey || 'Untitled' }}
                          </p>
                          <p class="truncate text-[9px] text-white/72">
                            {{
                              photo.city
                                ? `${photo.city} · ${dayjs(photo.createdAt).format('MM-DD')}`
                                : dayjs(photo.createdAt).format('YYYY-MM-DD')
                            }}
                          </p>
                        </div>
                      </div>

                      <div
                        v-if="
                          !isCoverSelectorMode &&
                          draftSelectedPhotoIds.includes(photo.id)
                        "
                        class="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-white/85 bg-primary-500 px-1 text-white shadow-sm"
                      >
                        <span
                          v-if="getDraftPhotoOrder(photo.id)"
                          class="text-[10px] font-semibold"
                        >
                          {{ getDraftPhotoOrder(photo.id) }}
                        </span>
                        <Icon
                          v-else
                          name="tabler:check"
                          size="14"
                        />
                      </div>

                      <UButton
                        v-if="draftCoverPhotoId !== photo.id"
                        size="xs"
                        color="warning"
                        variant="solid"
                        icon="tabler:star"
                        class="absolute right-1.5 top-1.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"
                        @click.stop="setDraftCoverPhoto(photo.id)"
                      />

                      <UBadge
                        v-else
                        color="warning"
                        variant="solid"
                        icon="tabler:star-filled"
                        class="absolute right-1.5 top-1.5"
                      >
                        {{ $t('dashboard.albums.modal.setCover') }}
                      </UBadge>
                    </div>
                  </button>
                </div>

                <div
                  v-else
                  class="flex h-64 flex-col items-center justify-center text-gray-500"
                >
                  <Icon
                    name="tabler:image-off"
                    size="48"
                    class="mb-3 opacity-50"
                  />
                  <p class="font-medium">
                    {{
                      !isCoverSelectorMode && hasActiveFilters
                        ? $t('dashboard.albums.modal.noResults')
                        : $t('dashboard.albums.modal.noPhotos')
                    }}
                  </p>
                  <p
                    v-if="!isCoverSelectorMode && hasActiveFilters"
                    class="mt-1 text-sm"
                  >
                    {{ $t('dashboard.albums.modal.tryOtherKeywords') }}
                  </p>
                </div>
              </div>

              <div
                class="shrink-0 border-t border-gray-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900 sm:p-4"
              >
                <div
                  class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end"
                >
                  <UButton
                    variant="outline"
                    color="neutral"
                    class="w-full sm:w-auto"
                    @click="closePhotoSelector"
                  >
                    {{ $t('dashboard.albums.slideover.cancel') }}
                  </UButton>
                  <UButton
                    icon="tabler:check"
                    color="primary"
                    class="w-full sm:w-auto"
                    @click="confirmPhotoSelection"
                  >
                    {{
                      isCoverSelectorMode
                        ? $t('dashboard.albums.modal.setCover')
                        : $t('dashboard.albums.modal.confirm', {
                            count: draftSelectedPhotoIds.length,
                          })
                    }}
                  </UButton>
                </div>
              </div>
            </div>
          </template>
        </UModal>

        <UModal v-model:open="isDeleteConfirmOpen">
          <template #content>
            <div class="p-6 space-y-4">
              <div class="flex items-center gap-3">
                <div
                  class="shrink-0 w-10 h-10 bg-error-100 dark:bg-error-900/30 rounded-full flex items-center justify-center"
                >
                  <Icon
                    name="tabler:alert-circle"
                    class="text-error-500"
                  />
                </div>
                <div>
                  <h3 class="text-lg font-semibold">
                    {{ $t('dashboard.albums.delete.title') }}
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {{
                      $t('dashboard.albums.delete.message', {
                        title: currentAlbum?.title,
                      })
                    }}
                  </p>
                </div>
              </div>

              <div class="flex justify-end gap-2 pt-4">
                <UButton
                  variant="ghost"
                  color="neutral"
                  @click="isDeleteConfirmOpen = false"
                >
                  {{ $t('dashboard.albums.delete.cancel') }}
                </UButton>
                <UButton
                  color="error"
                  icon="tabler:trash"
                  @click="deleteAlbum"
                >
                  {{ $t('dashboard.albums.delete.confirm') }}
                </UButton>
              </div>
            </div>
          </template>
        </UModal>

        <UModal v-model:open="isRemovePhotoConfirmOpen">
          <template #content>
            <div class="p-6 space-y-4">
              <div class="flex items-center gap-3">
                <div
                  class="shrink-0 w-10 h-10 bg-error-100 dark:bg-error-900/30 rounded-full flex items-center justify-center"
                >
                  <Icon
                    name="tabler:trash"
                    class="text-error-500"
                  />
                </div>
                <div>
                  <h3 class="text-lg font-semibold">
                    {{ $t('dashboard.albums.photoRemove.title') }}
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {{ $t('dashboard.albums.photoRemove.message') }}
                  </p>
                </div>
              </div>

              <div class="flex justify-end gap-2 pt-4">
                <UButton
                  variant="ghost"
                  color="neutral"
                  @click="isRemovePhotoConfirmOpen = false"
                >
                  {{ $t('dashboard.albums.photoRemove.cancel') }}
                </UButton>
                <UButton
                  color="error"
                  icon="tabler:trash"
                  @click="removeSelectedPhotoFromAlbum"
                >
                  {{ $t('dashboard.albums.photoRemove.confirm') }}
                </UButton>
              </div>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
