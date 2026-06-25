import path from 'node:path'
import type { EventHandlerRequest, H3Event } from 'h3'
import { createError, getRequestURL, setHeader } from 'h3'
import type { Photo } from '~~/server/utils/db'

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

const getContentType = (fileName: string) => {
  switch (path.extname(fileName).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    case '.tif':
    case '.tiff':
      return 'image/tiff'
    case '.heic':
      return 'image/heic'
    case '.heif':
      return 'image/heif'
    default:
      return 'application/octet-stream'
  }
}

const getContentDisposition = (fileName: string) => {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

const getPhotoFileName = (photo: Photo) => {
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

  return path.extname(sanitizedName)
    ? sanitizedName
    : `${sanitizedName}${extension}`
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

export default eventHandler(async (event) => {
  const photoId = getRouterParam(event, 'photoId')

  if (!photoId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid photo id',
    })
  }

  const photo = useDB()
    .select()
    .from(tables.photos)
    .where(eq(tables.photos.id, photoId))
    .get()

  if (!photo) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Photo not found',
    })
  }

  const { storageProvider } = useStorageProvider(event)
  let data: Buffer | null = null

  if (photo.storageKey) {
    try {
      const storedPhoto = await storageProvider.get(photo.storageKey)
      if (storedPhoto) {
        data = Buffer.from(storedPhoto)
      }
    } catch {
      data = null
    }
  }

  data ||= await getPhotoBufferFromUrl(event, photo.originalUrl)

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Photo file not found',
    })
  }

  const fileName = getPhotoFileName(photo)

  setHeader(event, 'Content-Type', getContentType(fileName))
  setHeader(event, 'Content-Disposition', getContentDisposition(fileName))
  setHeader(event, 'Content-Length', String(data.length))
  setHeader(event, 'Cache-Control', 'private, max-age=0, must-revalidate')

  return data
})
