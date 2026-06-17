import { asc, getTableColumns, sql } from 'drizzle-orm'
import z from 'zod'

const normalizeTags = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean)
  }

  if (typeof value !== 'string') {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.map((tag) => String(tag).trim()).filter(Boolean)
    }
  } catch {
    return []
  }

  return []
}

export default eventHandler(async (event) => {
  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({
      albumId: z
        .string()
        .regex(/^\d+$/)
        .transform((val) => parseInt(val, 10)),
    }).parse,
  )

  const db = useDB()
  const query = getQuery(event)
  const summaryOnly = query.summary === '1' || query.summary === 'true'

  const album = db
    .select()
    .from(tables.albums)
    .where(eq(tables.albums.id, albumId))
    .get()

  if (!album) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Album not found',
    })
  }

  // 检查相册是否隐藏，如果隐藏则需要用户登录才能访问
  if (album.isHidden) {
    const session = await getUserSession(event)
    if (!session.user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Album not found',
      })
    }
  }

  const youtubeVideos = await db
    .select({
      ...getTableColumns(tables.youtubeVideos),
      position: tables.albumYoutubeVideos.position,
    })
    .from(tables.youtubeVideos)
    .innerJoin(
      tables.albumYoutubeVideos,
      eq(tables.youtubeVideos.id, tables.albumYoutubeVideos.youtubeVideoId),
    )
    .where(eq(tables.albumYoutubeVideos.albumId, albumId))
    .orderBy(asc(tables.albumYoutubeVideos.position))
    .all()

  if (summaryOnly) {
    const photoStatsRow = db
      .select({
        total: sql<number>`count(*)`,
        withDates: sql<number>`sum(case when ${tables.photos.dateTaken} is not null and ${tables.photos.dateTaken} != '' then 1 else 0 end)`,
        withExif: sql<number>`sum(case when ${tables.photos.exif} is not null and ${tables.photos.exif} != '' then 1 else 0 end)`,
        startDate: sql<string | null>`min(${tables.photos.dateTaken})`,
        endDate: sql<string | null>`max(${tables.photos.dateTaken})`,
      })
      .from(tables.photos)
      .innerJoin(
        tables.albumPhotos,
        eq(tables.photos.id, tables.albumPhotos.photoId),
      )
      .where(eq(tables.albumPhotos.albumId, albumId))
      .get()

    const tagRows = db
      .select({
        tags: tables.photos.tags,
      })
      .from(tables.photos)
      .innerJoin(
        tables.albumPhotos,
        eq(tables.photos.id, tables.albumPhotos.photoId),
      )
      .where(eq(tables.albumPhotos.albumId, albumId))
      .all()

    const tagCounts = new Map<string, number>()
    for (const row of tagRows) {
      for (const tag of normalizeTags(row.tags)) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }

    const coverPhoto = album.coverPhotoId
      ? db
          .select({
            ...getTableColumns(tables.photos),
          })
          .from(tables.photos)
          .where(eq(tables.photos.id, album.coverPhotoId))
          .get()
      : db
          .select({
            ...getTableColumns(tables.photos),
          })
          .from(tables.photos)
          .innerJoin(
            tables.albumPhotos,
            eq(tables.photos.id, tables.albumPhotos.photoId),
          )
          .where(eq(tables.albumPhotos.albumId, albumId))
          .orderBy(asc(tables.albumPhotos.position))
          .limit(1)
          .get()

    return {
      ...album,
      photos: [],
      coverPhoto: coverPhoto || null,
      photoCount: Number(photoStatsRow?.total || 0),
      photoStats: {
        total: Number(photoStatsRow?.total || 0),
        withDates: Number(photoStatsRow?.withDates || 0),
        withExif: Number(photoStatsRow?.withExif || 0),
        dateRange:
          photoStatsRow?.startDate && photoStatsRow?.endDate
            ? {
                start: photoStatsRow.startDate,
                end: photoStatsRow.endDate,
              }
            : null,
      },
      tagFilters: Array.from(tagCounts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((left, right) => {
          if (right.count !== left.count) {
            return right.count - left.count
          }

          return left.label.localeCompare(right.label)
        }),
      youtubeVideos,
    }
  }

  // 获取相册中的照片
  const photos = await db
    // all fields from tables.photos
    .select({
      ...getTableColumns(tables.photos),
    })
    .from(tables.photos)
    .innerJoin(
      tables.albumPhotos,
      eq(tables.photos.id, tables.albumPhotos.photoId),
    )
    .where(eq(tables.albumPhotos.albumId, albumId))
    .orderBy(asc(tables.albumPhotos.position))
    .all()

  // 验证相册数据完整性
  if (!photos || !Array.isArray(photos)) {
    // 空相册也是合法的，只需要返回空数组
    return {
      ...album,
      photos: [],
      youtubeVideos,
    }
  }

  return {
    ...album,
    photos,
    youtubeVideos,
  }
})
