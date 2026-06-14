export interface ZipFileEntry {
  name: string
  data: Buffer
  modifiedAt?: Date | string | null
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)

  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
    table[i] = crc >>> 0
  }

  return table
})()

const crc32 = (buffer: Buffer) => {
  let crc = 0xffffffff

  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

const toDosDateTime = (value?: Date | string | null) => {
  const date = value ? new Date(value) : new Date()
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  const year = Math.min(Math.max(safeDate.getFullYear(), 1980), 2107)

  return {
    time:
      (safeDate.getHours() << 11) |
      (safeDate.getMinutes() << 5) |
      Math.floor(safeDate.getSeconds() / 2),
    date:
      ((year - 1980) << 9) |
      ((safeDate.getMonth() + 1) << 5) |
      safeDate.getDate(),
  }
}

const assertZip32Size = (value: number, label: string) => {
  if (value > 0xffffffff) {
    throw new Error(`${label} is too large for ZIP32`)
  }
}

export const createStoredZip = (files: ZipFileEntry[]) => {
  if (files.length > 0xffff) {
    throw new Error('ZIP contains too many files')
  }

  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf8')
    const checksum = crc32(file.data)
    const { time, date } = toDosDateTime(file.modifiedAt)

    assertZip32Size(file.data.length, file.name)
    if (nameBuffer.length > 0xffff) {
      throw new Error(`${file.name} file name is too long for ZIP32`)
    }
    assertZip32Size(offset, 'ZIP offset')

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(time, 10)
    localHeader.writeUInt16LE(date, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(file.data.length, 18)
    localHeader.writeUInt32LE(file.data.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localParts.push(localHeader, nameBuffer, file.data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(time, 12)
    centralHeader.writeUInt16LE(date, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(file.data.length, 20)
    centralHeader.writeUInt32LE(file.data.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    centralParts.push(centralHeader, nameBuffer)

    offset += localHeader.length + nameBuffer.length + file.data.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  assertZip32Size(centralDirectory.length, 'ZIP central directory')
  assertZip32Size(offset, 'ZIP central directory offset')

  const endOfCentralDirectory = Buffer.alloc(22)
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0)
  endOfCentralDirectory.writeUInt16LE(0, 4)
  endOfCentralDirectory.writeUInt16LE(0, 6)
  endOfCentralDirectory.writeUInt16LE(files.length, 8)
  endOfCentralDirectory.writeUInt16LE(files.length, 10)
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12)
  endOfCentralDirectory.writeUInt32LE(offset, 16)
  endOfCentralDirectory.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory])
}
