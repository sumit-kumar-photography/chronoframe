import z from 'zod'
import {
  getYoutubeThumbnailUrl,
  getYoutubeVideoId,
  getYoutubeWatchUrl,
} from '~~/shared/utils/youtube'
import { tables } from './db'

export const youtubeVideoInputSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  title: z.string().trim().max(255).optional().nullable(),
  thumbnailUrl: z.string().trim().max(2048).optional().nullable(),
})

type YoutubeVideoInput = z.infer<typeof youtubeVideoInputSchema>

export const saveAlbumYoutubeVideos = (
  tx: any,
  albumId: number,
  videos: YoutubeVideoInput[],
) => {
  const seenYoutubeIds = new Set<string>()
  let pos = 1000000

  for (const video of videos) {
    const youtubeId = getYoutubeVideoId(video.url)
    if (!youtubeId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid YouTube URL',
      })
    }

    if (seenYoutubeIds.has(youtubeId)) {
      continue
    }
    seenYoutubeIds.add(youtubeId)

    const title = video.title?.trim() || null
    const url = getYoutubeWatchUrl(youtubeId)
    const thumbnailUrl =
      video.thumbnailUrl?.trim() || getYoutubeThumbnailUrl(youtubeId)
    const updatedAt = new Date()

    const savedVideo = tx
      .insert(tables.youtubeVideos)
      .values({
        youtubeId,
        url,
        title,
        thumbnailUrl,
      })
      .onConflictDoUpdate({
        target: tables.youtubeVideos.youtubeId,
        set: {
          url,
          title,
          thumbnailUrl,
          updatedAt,
        },
      })
      .returning({ id: tables.youtubeVideos.id })
      .get()

    tx.insert(tables.albumYoutubeVideos)
      .values({
        albumId,
        youtubeVideoId: savedVideo.id,
        position: (pos += 10),
      })
      .onConflictDoNothing()
      .run()
  }
}
