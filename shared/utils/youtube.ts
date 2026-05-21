export const YOUTUBE_STORAGE_PREFIX = 'youtube:'

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

export function parseYoutubeVideoId(input: string): string | null {
  const value = input.trim()
  if (YOUTUBE_ID_PATTERN.test(value)) {
    return value
  }

  try {
    const url = new URL(
      /^[a-z][a-z\d+\-.]*:\/\//i.test(value) ? value : `https://${value}`,
    )
    const host = url.hostname.replace(/^www\./, '').toLowerCase()

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return id && YOUTUBE_ID_PATTERN.test(id) ? id : null
    }

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      const watchId = url.searchParams.get('v')
      if (watchId && YOUTUBE_ID_PATTERN.test(watchId)) {
        return watchId
      }

      const [type, id] = url.pathname.split('/').filter(Boolean)
      if (
        ['embed', 'shorts', 'live', 'v'].includes(type || '') &&
        id &&
        YOUTUBE_ID_PATTERN.test(id)
      ) {
        return id
      }
    }
  } catch {
    return null
  }

  return null
}

export function isYoutubeStorageKey(storageKey?: string | null): boolean {
  return Boolean(storageKey?.startsWith(YOUTUBE_STORAGE_PREFIX))
}

export function getYoutubeVideoIdFromStorageKey(
  storageKey?: string | null,
): string | null {
  if (!isYoutubeStorageKey(storageKey)) {
    return null
  }

  const id = storageKey!.slice(YOUTUBE_STORAGE_PREFIX.length)
  return YOUTUBE_ID_PATTERN.test(id) ? id : null
}

export function getYoutubeStorageKey(videoId: string): string {
  return `${YOUTUBE_STORAGE_PREFIX}${videoId}`
}

export function getYoutubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function getYoutubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`
}

export function getYoutubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}
