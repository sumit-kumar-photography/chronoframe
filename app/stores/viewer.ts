export interface ViewerYoutubeItem {
  type: 'youtube'
  id: string
  youtubeId: string
  url: string
  title?: string | null
  thumbnailUrl: string
}

export type ViewerPhotoItem = Photo & {
  type?: 'photo'
}

export type ViewerMediaItem = ViewerPhotoItem | ViewerYoutubeItem

export const isViewerYoutubeItem = (
  item?: ViewerMediaItem | null,
): item is ViewerYoutubeItem => item?.type === 'youtube'

export const useViewerState = defineStore('photo-viewer-state', () => {
  const currentPhotoIndex = ref(0)
  const isViewerOpen = ref(false)
  const returnRoute = ref<string | null>(null)
  const isDirectAccess = ref(false)
  const photoCollection = shallowRef<ViewerMediaItem[] | null>(null)

  const openViewer = (
    index: number,
    route?: string | null,
    photos?: ViewerMediaItem[] | null,
  ) => {
    currentPhotoIndex.value = index
    isViewerOpen.value = true
    photoCollection.value = photos?.length ? [...photos] : null

    if (route) {
      returnRoute.value = route
      isDirectAccess.value = false
    } else {
      isDirectAccess.value = true
    }
  }

  const switchToIndex = (index: number) => {
    currentPhotoIndex.value = index
  }

  const closeViewer = () => {
    isViewerOpen.value = false
  }

  const clearReturnRoute = () => {
    returnRoute.value = null
  }

  const clearPhotoCollection = () => {
    photoCollection.value = null
  }

  return {
    currentPhotoIndex,
    isViewerOpen,
    returnRoute,
    isDirectAccess,
    photoCollection,
    openViewer,
    switchToIndex,
    closeViewer,
    clearReturnRoute,
    clearPhotoCollection,
  }
})
