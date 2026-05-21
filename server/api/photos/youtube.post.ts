import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { tables, useDB } from '~~/server/utils/db'
import {
  getYoutubeStorageKey,
  getYoutubeThumbnailUrl,
  getYoutubeWatchUrl,
  parseYoutubeVideoId,
} from '~~/shared/utils/youtube'

const bodySchema = z.object({
  url: z.string().trim().min(1),
  title: z.string().trim().max(512).optional(),
  description: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().max(128)).max(64).optional(),
  allowExisting: z.boolean().optional(),
})

const normalizeTags = (tags: string[] | undefined): string[] => {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const tag of tags || []) {
    const trimmed = tag.trim()
    if (!trimmed) continue

    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    normalized.push(trimmed)
  }

  return normalized
}

export default eventHandler(async (event) => {
  await requireUserSession(event)
  const t = await useTranslation(event)

  const body = await readValidatedBody(event, bodySchema.parse)
  const videoId = parseYoutubeVideoId(body.url)

  if (!videoId) {
    throw createError({
      statusCode: 400,
      statusMessage: t('dashboard.photos.youtubeVideo.messages.invalidUrl'),
    })
  }

  const db = useDB()
  const photoId = `youtube-${videoId}`
  const existingPhoto = db
    .select()
    .from(tables.photos)
    .where(eq(tables.photos.id, photoId))
    .get()

  if (existingPhoto) {
    if (body.allowExisting) {
      return {
        success: true,
        existing: true,
        photo: existingPhoto,
      }
    }

    throw createError({
      statusCode: 409,
      statusMessage: t('dashboard.photos.youtubeVideo.messages.duplicate'),
    })
  }

  const now = new Date().toISOString()
  const photo = db
    .insert(tables.photos)
    .values({
      id: photoId,
      title:
        body.title?.trim() || t('dashboard.photos.youtubeVideo.defaultTitle'),
      description: body.description?.trim() || null,
      width: 480,
      height: 360,
      aspectRatio: 4 / 3,
      dateTaken: now,
      storageKey: getYoutubeStorageKey(videoId),
      thumbnailKey: null,
      fileSize: null,
      lastModified: now,
      originalUrl: getYoutubeWatchUrl(videoId),
      thumbnailUrl: getYoutubeThumbnailUrl(videoId),
      thumbnailHash: null,
      tags: normalizeTags(body.tags),
      exif: null,
      isLivePhoto: 0,
      livePhotoVideoUrl: null,
      livePhotoVideoKey: null,
    })
    .returning()
    .get()

  return {
    success: true,
    photo,
  }
})
