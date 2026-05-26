export const usePhotoDownload = () => {
  const toast = useToast()
  const { $i18n } = useNuxtApp()
  const { gtag } = useGtag()

  const downloadOriginalPhoto = async (photo: Photo) => {
    if (!photo.originalUrl) {
      return
    }

    try {
      const response = await fetch(photo.originalUrl)
      if (!response.ok) {
        throw new Error(response.statusText || 'Download failed')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      const cleanUrl = photo.originalUrl.split('?')[0] || photo.originalUrl
      const extension = cleanUrl.split('.').pop() || 'jpg'

      link.href = url
      link.download = `${photo.title || 'photo'}.${extension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      gtag('event', 'photo_download', {
        photo_id: photo.id,
        photo_title: photo.title || 'Untitled',
        download_type: 'original',
      })

      toast.add({
        title: String(
          $i18n.t('ui.action.share.success.originalImageDownloaded'),
        ),
        color: 'success',
        icon: 'tabler:download',
        duration: 3000,
      })
    } catch (error) {
      toast.add({
        title: String(
          $i18n.t('ui.action.share.error.originalImageDownloadFailed'),
        ),
        description: (error as Error)?.message || 'Unknown error',
        color: 'error',
        icon: 'tabler:x',
        duration: 3000,
      })
    }
  }

  return {
    downloadOriginalPhoto,
  }
}
