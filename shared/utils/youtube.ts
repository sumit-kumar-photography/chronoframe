const YOUTUBE_VIDEO_ID_PATTERN = /^[\w-]{11}$/

export const getYoutubeVideoId = (input: string) => {
  const value = input.trim()
  if (!value) return null

  if (YOUTUBE_VIDEO_ID_PATTERN.test(value)) {
    return value
  }

  const directMatch = value.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/,
  )
  if (directMatch?.[1]) {
    return directMatch[1]
  }

  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    const host = url.hostname.replace(/^(www\.|m\.)/, '')

    if (host === 'youtu.be') {
      const videoId = url.pathname.split('/').filter(Boolean)[0]
      return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId)
        ? videoId
        : null
    }

    if (host === 'youtube.com' || host === 'music.youtube.com') {
      const watchId = url.searchParams.get('v')
      if (watchId && YOUTUBE_VIDEO_ID_PATTERN.test(watchId)) {
        return watchId
      }

      const [, route, videoId] = url.pathname.split('/')
      if (
        ['embed', 'shorts', 'live', 'v'].includes(route || '') &&
        videoId &&
        YOUTUBE_VIDEO_ID_PATTERN.test(videoId)
      ) {
        return videoId
      }
    }
  } catch {
    return null
  }

  return null
}

export const getYoutubeWatchUrl = (videoId: string) => {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export const getYoutubeThumbnailUrl = (videoId: string) => {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

export const getYoutubeEmbedUrl = (videoId: string) => {
  return `https://www.youtube.com/embed/${videoId}`
}
