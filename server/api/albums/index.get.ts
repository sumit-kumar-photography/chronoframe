export default eventHandler(async (_event) => {
  const db = useDB()

  // 获取所有相册，按创建时间倒序
  const albums = await db.select().from(tables.albums)

  // 为每个相册获取照片 ID 列表（避免循环引用）
  const albumsWithPhotoIds = await Promise.all(
    albums.map(async (album) => {
      const photoIds = await db
        .select({
          photoId: tables.albumPhotos.photoId,
          position: tables.albumPhotos.position,
        })
        .from(tables.albumPhotos)
        .where(eq(tables.albumPhotos.albumId, album.id))
        .orderBy(tables.albumPhotos.position)

      const youtubeVideoIds = await db
        .select({
          youtubeVideoId: tables.albumYoutubeVideos.youtubeVideoId,
          position: tables.albumYoutubeVideos.position,
        })
        .from(tables.albumYoutubeVideos)
        .where(eq(tables.albumYoutubeVideos.albumId, album.id))
        .orderBy(tables.albumYoutubeVideos.position)

      return {
        ...album,
        // 即使是空相册，也返回空数组而不是 undefined
        photoIds: photoIds.length > 0 ? photoIds.map((p) => p.photoId) : [],
        youtubeVideoIds:
          youtubeVideoIds.length > 0
            ? youtubeVideoIds.map((video) => video.youtubeVideoId)
            : [],
      }
    }),
  )

  // 按创建时间倒序排列
  return albumsWithPhotoIds.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
})
