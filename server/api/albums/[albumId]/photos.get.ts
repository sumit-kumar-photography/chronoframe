import { and, asc, getTableColumns, sql } from 'drizzle-orm'
import z from 'zod'

const getQueryTags = (value: unknown) => {
  const values = Array.isArray(value) ? value : value ? [value] : []

  return values
    .flatMap((tag) => String(tag).split(','))
    .map((tag) => tag.trim())
    .filter(Boolean)
}

const getAlbumPhotoWhereClause = (albumId: number, tags: string[]) => {
  const conditions = [eq(tables.albumPhotos.albumId, albumId)]

  if (tags.length > 0) {
    const tagValues = tags.map((tag) => sql`${tag}`)
    conditions.push(
      sql`exists (
        select 1
        from json_each(
          case
            when json_valid(${tables.photos.tags}) then ${tables.photos.tags}
            else '[]'
          end
        )
        where json_each.value in (${sql.join(tagValues, sql`, `)})
      )`,
    )
  }

  return and(...conditions)
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

  const query = getQuery(event)
  const { offset, limit } = z
    .object({
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .parse(query)
  const tags = getQueryTags(query.tags)

  const db = useDB()
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

  if (album.isHidden) {
    const session = await getUserSession(event)
    if (!session.user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Album not found',
      })
    }
  }

  const whereClause = getAlbumPhotoWhereClause(albumId, tags)
  const totalRow = db
    .select({ total: sql<number>`count(*)` })
    .from(tables.photos)
    .innerJoin(
      tables.albumPhotos,
      eq(tables.photos.id, tables.albumPhotos.photoId),
    )
    .where(whereClause)
    .get()

  const photos = db
    .select({
      ...getTableColumns(tables.photos),
    })
    .from(tables.photos)
    .innerJoin(
      tables.albumPhotos,
      eq(tables.photos.id, tables.albumPhotos.photoId),
    )
    .where(whereClause)
    .orderBy(asc(tables.albumPhotos.position))
    .limit(limit)
    .offset(offset)
    .all()

  const total = Number(totalRow?.total || 0)

  return {
    photos,
    total,
    offset,
    limit,
    hasMore: offset + photos.length < total,
  }
})
