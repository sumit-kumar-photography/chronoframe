import type { _Object, S3ClientConfig } from '@aws-sdk/client-s3'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type {
  StorageObject,
  StorageProvider,
  UploadOptions,
} from '../interfaces'

const DEFAULT_S3_MAX_SOCKETS = 512
const DEFAULT_S3_SOCKET_ACQUISITION_WARNING_TIMEOUT = 10_000

const isCloudflareR2Endpoint = (endpoint?: string): boolean => {
  return Boolean(endpoint?.includes('.r2.cloudflarestorage.com'))
}

const toPositiveInteger = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.floor(parsed)
}

const toNonNegativeInteger = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return Math.floor(parsed)
}

const encodeObjectKeyPath = (key: string): string => {
  return key.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
}

const normalizeObjectKey = (key: string): string => {
  return key.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '')
}

const combinePrefixAndKey = (prefix: string | undefined, key: string) => {
  const cleanPrefix = normalizeObjectKey(prefix || '').replace(/\/+$/, '')
  const cleanKey = normalizeObjectKey(key)

  if (!cleanPrefix) return cleanKey
  return cleanKey === cleanPrefix || cleanKey.startsWith(`${cleanPrefix}/`)
    ? cleanKey
    : `${cleanPrefix}/${cleanKey}`
}

const createClient = (config: S3StorageConfig): S3Client => {
  if (config.provider !== 's3') {
    throw new Error('Invalid provider for S3 client creation')
  }

  const { accessKeyId, secretAccessKey, region, endpoint } = config
  const maxSockets =
    toPositiveInteger(config.maxSockets) ?? DEFAULT_S3_MAX_SOCKETS
  const socketAcquisitionWarningTimeout =
    toNonNegativeInteger(config.socketAcquisitionWarningTimeout) ??
    DEFAULT_S3_SOCKET_ACQUISITION_WARNING_TIMEOUT

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Missing required accessKeyId or secretAccessKey')
  }

  const clientConfig: S3ClientConfig = {
    endpoint,
    region,
    forcePathStyle:
      config.forcePathStyle ?? isCloudflareR2Endpoint(config.endpoint),
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    requestHandler: {
      httpAgent: {
        keepAlive: true,
        maxSockets,
      },
      httpsAgent: {
        keepAlive: true,
        maxSockets,
      },
      socketAcquisitionWarningTimeout,
    },
  }

  return new S3Client(clientConfig)
}

const convertToStorageObject = (s3object: _Object): StorageObject => {
  return {
    key: s3object.Key || '',
    size: s3object.Size,
    lastModified: s3object.LastModified,
    etag: s3object.ETag,
  }
}

export class S3StorageProvider implements StorageProvider {
  config: S3StorageConfig
  private logger?: Logger['storage']
  private client: S3Client

  constructor(config: S3StorageConfig, logger?: Logger['storage']) {
    this.config = config
    this.logger = logger
    this.client = createClient(config)
  }

  async create(
    key: string,
    data: Buffer,
    contentType?: string,
  ): Promise<StorageObject> {
    try {
      const absoluteKey = combinePrefixAndKey(this.config.prefix, key)
      const cmd = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: absoluteKey,
        Body: data,
        ContentType: contentType || 'application/octet-stream',
      })

      const resp = await this.client.send(cmd)

      this.logger?.success(`Created object with key: ${absoluteKey}`)

      return {
        key: absoluteKey,
        size: data.length,
        lastModified: new Date(),
        etag: resp.ETag,
      }
    } catch (error) {
      this.logger?.error(`Failed to create object with key: ${key}`, error)
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const objectKey = normalizeObjectKey(key)
      const cmd = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      })

      await this.client.send(cmd)
      this.logger?.success(`Deleted object with key: ${objectKey}`)
    } catch (error) {
      this.logger?.error(`Failed to delete object with key: ${key}`, error)
      throw error
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const objectKey = normalizeObjectKey(key)
      const cmd = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      })

      const resp = await this.client.send(cmd)

      if (!resp.Body) {
        return null
      }

      if (resp.Body instanceof Buffer) {
        return resp.Body
      }

      const chunks: Uint8Array[] = []
      const stream = resp.Body as NodeJS.ReadableStream

      return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', (chunk: Uint8Array) => {
          chunks.push(chunk)
        })

        stream.on('end', () => {
          resolve(Buffer.concat(chunks))
        })

        stream.on('error', (err) => {
          reject(err)
        })
      })
    } catch {
      return null
    }
  }

  getPublicUrl(key: string): string {
    const { cdnUrl, bucket, region, endpoint } = this.config
    const objectKey = normalizeObjectKey(key)

    // CDN URL
    if (cdnUrl) {
      return `${cdnUrl.replace(/\/$/, '')}/${objectKey}`
    }

    // Cloudflare R2 buckets are private by default. Without a public/custom
    // domain, serve objects through the app so uploaded photos still render.
    if (isCloudflareR2Endpoint(endpoint)) {
      return `/image/${encodeObjectKeyPath(objectKey)}`
    }

    // Default AWS S3 endpoint
    if (!endpoint) {
      return `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`
    } else if (endpoint.includes('amazonaws.com')) {
      return `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`
    }

    // Alibaba Cloud OSS
    if (endpoint.includes('aliyuncs.com')) {
      const baseUrl = endpoint.replace(/\/$/, '')
      if (baseUrl.indexOf('//') === -1) {
        throw new Error('Invalid endpoint URL')
      }
      const protocol = baseUrl.split('//')[0]
      const remainder = baseUrl.split('//')[1]
      return `${protocol}//${bucket}.${remainder}/${objectKey}`
    }

    // Custom endpoint
    return `${endpoint.replace(/\/$/, '')}/${bucket}/${objectKey}`
  }

  async getSignedUrl(
    key: string,
    expiresIn: number = 3600,
    options?: UploadOptions,
  ): Promise<string> {
    const objectKey = normalizeObjectKey(key)
    const cmd = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      ContentType: options?.contentType || 'application/octet-stream',
    })

    const url = await getSignedUrl(this.client, cmd, {
      expiresIn,
      // 为了更好的 CORS 支持，添加一些额外参数
      unhoistableHeaders: new Set(['Content-Type']),
    })
    return url
  }

  async getFileMeta(key: string): Promise<StorageObject | null> {
    try {
      const objectKey = normalizeObjectKey(key)
      const cmd = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      })

      const resp = await this.client.send(cmd)

      if (!resp.ETag) {
        return null
      }

      return {
        key: objectKey,
        size: resp.ContentLength || 0,
        lastModified: resp.LastModified,
        etag: resp.ETag,
      }
    } catch (error) {
      if ((error as any).$metadata?.httpStatusCode === 404) {
        return null
      }
      this.logger?.error(`Failed to get metadata for key: ${key}`, error)
      throw error
    }
  }

  async listAll(): Promise<StorageObject[]> {
    const cmd = new ListObjectsCommand({
      Bucket: this.config.bucket,
      Prefix: normalizeObjectKey(this.config.prefix || ''),
      MaxKeys: this.config.maxKeys,
    })

    const resp = await this.client.send(cmd)
    this.logger?.log(resp.Contents?.map(convertToStorageObject))
    return resp.Contents?.map(convertToStorageObject) || []
  }

  async listImages(): Promise<StorageObject[]> {
    const cmd = new ListObjectsCommand({
      Bucket: this.config.bucket,
      Prefix: normalizeObjectKey(this.config.prefix || ''),
      MaxKeys: this.config.maxKeys,
    })

    const resp = await this.client.send(cmd)
    // TODO: filter supported image format
    return resp.Contents?.map(convertToStorageObject) || []
  }
}
