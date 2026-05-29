import sharp from 'sharp'
import { withRetry, RetryPresets } from '../../utils/retry'

const VIEWER_RENDITION_MAX_BYTES = 1536 * 1024
const VIEWER_RENDITION_INITIAL_WIDTH = 2400
const VIEWER_RENDITION_MIN_WIDTH = 320
const VIEWER_RENDITION_QUALITIES = [86, 78, 70, 62, 54, 46, 38, 30]

const renderViewerRendition = async (
  buffer: Buffer,
  width: number,
  quality: number,
) => {
  return await sharp(buffer, { limitInputPixels: false })
    .rotate()
    .resize({
      width,
      height: width,
      fit: 'inside',
      withoutEnlargement: true,
      fastShrinkOnLoad: false,
    })
    .webp({ quality, effort: 4 })
    .toBuffer()
}

export const generateViewerRendition = async (
  buffer: Buffer,
  logger?: Logger[keyof Logger],
) => {
  return await withRetry(
    async () => {
      let width = VIEWER_RENDITION_INITIAL_WIDTH
      let bestBuffer: Buffer | null = null

      while (width >= VIEWER_RENDITION_MIN_WIDTH) {
        for (const quality of VIEWER_RENDITION_QUALITIES) {
          const renditionBuffer = await renderViewerRendition(
            buffer,
            width,
            quality,
          )
          bestBuffer = renditionBuffer

          if (renditionBuffer.length <= VIEWER_RENDITION_MAX_BYTES) {
            logger?.info(
              `Generated viewer rendition (${Math.round(renditionBuffer.length / 1024)} KB, width ${width}, quality ${quality})`,
            )
            return renditionBuffer
          }
        }

        width = Math.floor(width * 0.75)
      }

      if (!bestBuffer) {
        throw new Error('Failed to generate viewer rendition')
      }

      if (bestBuffer.length > VIEWER_RENDITION_MAX_BYTES) {
        logger?.warn(
          `Viewer rendition is above 1.5 MB after all attempts (${Math.round(bestBuffer.length / 1024)} KB)`,
        )
      }

      return bestBuffer
    },
    {
      ...RetryPresets.standard,
      timeout: 20000,
      delayStrategy: 'linear',
    },
    logger,
  )
}
