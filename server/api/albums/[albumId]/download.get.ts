import type { EventHandlerRequest, H3Event } from 'h3'
import type { StorageProvider } from '~~/server/services/storage'
import type { Photo } from '~~/server/utils/db'
import path from 'node:path'
import { asc, getTableColumns } from 'drizzle-orm'
import { createError, getRequestURL, setHeader } from 'h3'
import z from 'zod'
import type { ZipFileEntry } from '~~/server/utils/zip'
import { createStoredZip } from '~~/server/utils/zip'

const MAX_FILENAME_LENGTH = 140

const sanitizeFileName = (
  value: string | null | undefined,
  fallback: string,
) => {
  const cleaned = (value || '')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .slice(0, MAX_FILENAME_LENGTH)

  return cleaned || fallback
}

const getPathExtension = (value: string | null | undefined) => {
  if (!value) return ''

  const cleanPath = value.split(/[?#]/)[0] || ''
  const extension = path.extname(cleanPath).toLowerCase()

  return extension.length > 1 && extension.length <= 10 ? extension : ''
}

const getBasename = (value: string | null | undefined) => {
  if (!value) return ''

  try {
    const url = new URL(value, 'http://chronoframe.local')
    return path.basename(url.pathname)
  } catch {
    return path.basename(value.split(/[?#]/)[0] || '')
  }
}

const getUniquePhotoFileName = (photo: Photo, usedFileNames: Set<string>) => {
  const fallbackName = `photo-${photo.id}`
  const extension =
    getPathExtension(photo.storageKey) ||
    getPathExtension(photo.originalUrl) ||
    '.jpg'
  const rawName =
    photo.title ||
    getBasename(photo.storageKey) ||
    getBasename(photo.originalUrl)
  const sanitizedName = sanitizeFileName(rawName, fallbackName)
  const nameWithExtension = path.extname(sanitizedName)
    ? sanitizedName
    : `${sanitizedName}${extension}`
  const parsedName = path.parse(nameWithExtension)

  let candidate = `${parsedName.name}${parsedName.ext}`
  let suffix = 2

  while (usedFileNames.has(candidate.toLowerCase())) {
    candidate = `${parsedName.name}-${suffix}${parsedName.ext}`
    suffix += 1
  }

  usedFileNames.add(candidate.toLowerCase())
  return candidate
}

const getPhotoBufferFromUrl = async (
  event: H3Event<EventHandlerRequest>,
  originalUrl: string | null,
) => {
  if (!originalUrl) return null

  let sourceUrl = originalUrl

  if (sourceUrl.startsWith('/')) {
    sourceUrl = `${getRequestURL(event).origin}${sourceUrl}`
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    return null
  }

  const response = await fetch(sourceUrl)
  if (!response.ok) {
    return null
  }

  return Buffer.from(await response.arrayBuffer())
}

const getPhotoBuffer = async (
  event: H3Event<EventHandlerRequest>,
  storageProvider: StorageProvider,
  photo: Photo,
) => {
  if (photo.storageKey) {
    try {
      const storedPhoto = await storageProvider.get(photo.storageKey)
      if (storedPhoto) {
        return storedPhoto
      }
    } catch {
      // Fall back to originalUrl below when the backing object is unavailable.
    }
  }

  return await getPhotoBufferFromUrl(event, photo.originalUrl)
}

const getContentDisposition = (fileName: string) => {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
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

  const photos = await db
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

  if (photos.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No photos found in this album',
    })
  }

  const { storageProvider } = useStorageProvider(event)
  const usedFileNames = new Set<string>()
  const zipEntries: ZipFileEntry[] = []

  for (const photo of photos) {
    const data = await getPhotoBuffer(event, storageProvider, photo)
    if (!data) {
      continue
    }

    zipEntries.push({
      name: getUniquePhotoFileName(photo, usedFileNames),
      data,
      modifiedAt: photo.lastModified,
    })
  }

  if (zipEntries.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No downloadable photos found in this album',
    })
  }

  const archiveName = `${sanitizeFileName(
    album.title,
    `album-${album.id}`,
  )}.zip`
  const archive = createStoredZip(zipEntries)

  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', getContentDisposition(archiveName))
  setHeader(event, 'Content-Length', String(archive.length))

  return archive
})
