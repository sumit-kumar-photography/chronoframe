import z from 'zod'

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const body = await readValidatedBody(
    event,
    z.object({
      title: z.string().min(1).max(255),
      description: z.string().max(1000).optional(),
      coverPhotoId: z.string().optional(),
      photoIds: z.array(z.string()).optional(),
      isHidden: z.boolean().optional(),
      eventDate: dateOnlySchema.nullable().optional(),
    }).parse,
  )

  const db = useDB()

  const album = db.transaction((tx) => {
    const newAlbum = tx
      .insert(tables.albums)
      .values({
        title: body.title,
        description: body.description || null,
        coverPhotoId: body.coverPhotoId || null,
        isHidden: body.isHidden || false,
        eventDate: body.eventDate || null,
      })
      .returning()
      .get()

    const albumId = newAlbum.id
    const photoIds = new Set(body.photoIds || [])

    if (body.coverPhotoId) {
      photoIds.add(body.coverPhotoId)
    }

    if (photoIds.size > 0) {
      let pos = 1000000
      for (const photoId of photoIds) {
        tx.insert(tables.albumPhotos)
          .values({
            albumId,
            photoId,
            position: (pos += 10),
          })
          .onConflictDoNothing()
          .run()
      }
    }

    return newAlbum
  })

  return album
})
