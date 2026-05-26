import path from 'path'
import sharp from 'sharp'
import { getStorageManager } from '~~/server/plugins/3.storage'
import { settingsManager } from '../settings/settingsManager'

type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'

type WatermarkOutputFormat = 'jpeg' | 'png' | 'webp' | 'tiff' | 'avif'

interface WatermarkSettings {
  enabled: boolean
  logoUrl: string
  opacity: number
  sizePercent: number
  position: WatermarkPosition
}

export interface WatermarkedImage {
  buffer: Buffer
  contentType: string
  applied: boolean
}

const POSITION_VALUES: WatermarkPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
]

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const toNumber = (value: unknown, fallback: number) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const getWatermarkSettings = async (): Promise<WatermarkSettings> => {
  const enabled =
    (await settingsManager.get<boolean>('app', 'watermark.enabled')) ?? false
  const logoUrl =
    (await settingsManager.get<string>('app', 'watermark.logoUrl')) ?? ''
  const opacity = clamp(
    toNumber(await settingsManager.get('app', 'watermark.opacity'), 0.35),
    0.05,
    1,
  )
  const sizePercent = clamp(
    toNumber(await settingsManager.get('app', 'watermark.sizePercent'), 18),
    3,
    60,
  )
  const rawPosition =
    (await settingsManager.get<string>('app', 'watermark.position')) ??
    'bottom-right'
  const position = POSITION_VALUES.includes(rawPosition as WatermarkPosition)
    ? (rawPosition as WatermarkPosition)
    : 'bottom-right'

  return {
    enabled,
    logoUrl: logoUrl.trim(),
    opacity,
    sizePercent,
    position,
  }
}

const getPathname = (value: string) => {
  try {
    return new URL(value).pathname
  } catch {
    return value
  }
}

const decodeStoragePath = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const getStorageKeyFromLogoUrl = (logoUrl: string) => {
  const pathname = getPathname(logoUrl).split(/[?#]/)[0] || ''
  const decodedPath = decodeStoragePath(pathname)
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')

  for (const routePrefix of ['/storage/', '/image/']) {
    if (decodedPath.startsWith(routePrefix)) {
      return decodedPath.slice(routePrefix.length).replace(/^\/+/, '')
    }
  }

  if (!/^https?:\/\//i.test(logoUrl)) {
    return decodedPath.replace(/^\/+/, '')
  }

  return null
}

const getLogoBuffer = async (
  logoUrl: string,
  logger?: Logger[keyof Logger],
) => {
  const storageProvider = getStorageManager().getProvider()
  const storageKey = getStorageKeyFromLogoUrl(logoUrl)

  if (storageKey && storageProvider) {
    const storedLogo = await storageProvider.get(storageKey)
    if (storedLogo) {
      return storedLogo
    }
  }

  if (!/^https?:\/\//i.test(logoUrl)) {
    logger?.warn?.(`Watermark logo not found in storage: ${logoUrl}`)
    return null
  }

  const response = await fetch(logoUrl)
  if (!response.ok) {
    logger?.warn?.(
      `Watermark logo fetch failed: ${response.status} ${response.statusText}`,
    )
    return null
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

const getOutputFormat = (storageKey: string): WatermarkOutputFormat | null => {
  const ext = path.extname(storageKey).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'jpeg'
    case '.png':
      return 'png'
    case '.webp':
      return 'webp'
    case '.tif':
    case '.tiff':
      return 'tiff'
    case '.avif':
      return 'avif'
    default:
      return null
  }
}

export const getWatermarkContentType = (format: WatermarkOutputFormat) => {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'tiff':
      return 'image/tiff'
    case 'avif':
      return 'image/avif'
  }
}

const getWatermarkCoordinates = (
  imageWidth: number,
  imageHeight: number,
  watermarkWidth: number,
  watermarkHeight: number,
  position: WatermarkPosition,
) => {
  const margin = Math.max(
    12,
    Math.round(Math.min(imageWidth, imageHeight) * 0.035),
  )
  const right = Math.max(0, imageWidth - watermarkWidth - margin)
  const bottom = Math.max(0, imageHeight - watermarkHeight - margin)

  switch (position) {
    case 'top-left':
      return { left: margin, top: margin }
    case 'top-right':
      return { left: right, top: margin }
    case 'bottom-left':
      return { left: margin, top: bottom }
    case 'center':
      return {
        left: Math.max(0, Math.round((imageWidth - watermarkWidth) / 2)),
        top: Math.max(0, Math.round((imageHeight - watermarkHeight) / 2)),
      }
    case 'bottom-right':
    default:
      return { left: right, top: bottom }
  }
}

const encodeWatermarkedImage = (
  image: sharp.Sharp,
  format: WatermarkOutputFormat,
) => {
  switch (format) {
    case 'jpeg':
      return image.jpeg({ quality: 92, mozjpeg: true }).toBuffer()
    case 'png':
      return image.png({ compressionLevel: 9 }).toBuffer()
    case 'webp':
      return image.webp({ quality: 92 }).toBuffer()
    case 'tiff':
      return image.tiff({ quality: 92 }).toBuffer()
    case 'avif':
      return image.avif({ quality: 82 }).toBuffer()
  }
}

export const applyConfiguredWatermark = async (
  imageBuffer: Buffer,
  storageKey: string,
  logger?: Logger[keyof Logger],
): Promise<WatermarkedImage> => {
  const settings = await getWatermarkSettings()
  const outputFormat = getOutputFormat(storageKey)

  if (!settings.enabled || !settings.logoUrl || !outputFormat) {
    return {
      buffer: imageBuffer,
      contentType: outputFormat
        ? getWatermarkContentType(outputFormat)
        : 'application/octet-stream',
      applied: false,
    }
  }

  try {
    const baseImage = sharp(imageBuffer, { limitInputPixels: false }).rotate()
    const metadata = await baseImage.clone().metadata()
    if (!metadata.width || !metadata.height) {
      logger?.warn?.(
        `Watermark skipped; missing image dimensions: ${storageKey}`,
      )
      return {
        buffer: imageBuffer,
        contentType: getWatermarkContentType(outputFormat),
        applied: false,
      }
    }

    const logoBuffer = await getLogoBuffer(settings.logoUrl, logger)
    if (!logoBuffer) {
      return {
        buffer: imageBuffer,
        contentType: getWatermarkContentType(outputFormat),
        applied: false,
      }
    }

    const logoTargetWidth = Math.max(
      1,
      Math.round(metadata.width * (settings.sizePercent / 100)),
    )
    const resizedLogo = await sharp(logoBuffer, { limitInputPixels: false })
      .rotate()
      .resize({
        width: logoTargetWidth,
        withoutEnlargement: true,
        fit: 'inside',
      })
      .png()
      .toBuffer()
    const logoMetadata = await sharp(resizedLogo).metadata()

    if (!logoMetadata.width || !logoMetadata.height) {
      logger?.warn?.(
        `Watermark skipped; missing logo dimensions: ${storageKey}`,
      )
      return {
        buffer: imageBuffer,
        contentType: getWatermarkContentType(outputFormat),
        applied: false,
      }
    }

    const { left, top } = getWatermarkCoordinates(
      metadata.width,
      metadata.height,
      logoMetadata.width,
      logoMetadata.height,
      settings.position,
    )
    const watermarkSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${logoMetadata.width}" height="${logoMetadata.height}" viewBox="0 0 ${logoMetadata.width} ${logoMetadata.height}"><image href="data:image/png;base64,${resizedLogo.toString('base64')}" width="${logoMetadata.width}" height="${logoMetadata.height}" opacity="${settings.opacity}"/></svg>`,
    )

    const watermarkedBuffer = await encodeWatermarkedImage(
      baseImage.composite([{ input: watermarkSvg, left, top }]),
      outputFormat,
    )

    logger?.info?.(`Applied watermark to image: ${storageKey}`)

    return {
      buffer: watermarkedBuffer,
      contentType: getWatermarkContentType(outputFormat),
      applied: true,
    }
  } catch (error) {
    logger?.warn?.(`Watermark skipped for ${storageKey}`, error)
    return {
      buffer: imageBuffer,
      contentType: getWatermarkContentType(outputFormat),
      applied: false,
    }
  }
}
