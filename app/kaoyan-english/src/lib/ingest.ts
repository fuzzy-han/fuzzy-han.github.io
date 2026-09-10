/* ==========================================================================
   输入预处理
   · 图片：压缩 + 转 dataURL（控制 token 与请求体大小）
   · 文档：.txt/.md 直接读；.docx 用 zip 解出 document.xml 再抽文字
   ========================================================================== */

/* -------------------------------------------------------------------------- */
/*  图片                                                                       */
/* -------------------------------------------------------------------------- */

export interface ImagePayload {
  /** 压缩后的 dataURL，可直接放进 image_url */
  dataUrl: string
  /** 原始文件名 */
  name: string
  /** 压缩前后字节数，用于在界面上说明「已压缩」 */
  originalBytes: number
  compressedBytes: number
  width: number
  height: number
}

/** 视觉模型对长边超过约 2000px 的图片收益很低，反而猛涨 token */
const MAX_EDGE = 1600
/** JPEG 质量：手写体识别在 0.85 附近基本无损 */
const JPEG_QUALITY = 0.85

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片无法解码，请确认文件是否损坏'))
    }
    img.src = url
  })
}

/**
 * 压缩作文照片。
 *
 * 手写作文照片动辄 3–8MB，直接上传既慢又贵，
 * 而且很多服务商对单请求体积有上限。这里统一压到长边 1600px 以内。
 */
export async function compressImage(file: File): Promise<ImagePayload> {
  if (!file.type.startsWith('image/')) {
    throw new Error('不是图片文件')
  }

  const img = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas，无法处理图片')

  // 铺白底：手写照片常是透明 PNG 或偏暗，白底能提高识别率
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const compressedBytes = Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75)

  return {
    dataUrl,
    name: file.name,
    originalBytes: file.size,
    compressedBytes,
    width,
    height,
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/* -------------------------------------------------------------------------- */
/*  文档                                                                       */
/* -------------------------------------------------------------------------- */

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file, 'utf-8')
  })
}

/** 从 .docx 的 document.xml 里抽出纯文本 */
function docxXmlToText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')

  // 段落 → 换行；<w:br> 与 <w:tab> 也要还原，否则整篇会挤成一行
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'))
  const lines = paragraphs.map((p) => {
    const runs = Array.from(p.getElementsByTagName('w:t'))
      .map((t) => t.textContent ?? '')
      .join('')
    return runs
  })

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 解析 .docx。
 *
 * docx 本质是个 zip，正文在 word/document.xml。
 * 这里不引第三方库，直接用浏览器解压 API 取那一个文件——
 * 既能离线工作，也少一个供应链依赖。
 */
async function readDocx(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())

  // 简易 zip 扫描：定位 word/document.xml 的本地文件头并解压
  const decoder = new TextDecoder()
  const signature = [0x50, 0x4b, 0x03, 0x04]
  const target = 'word/document.xml'

  for (let i = 0; i < bytes.length - 4; i += 1) {
    if (bytes[i] !== signature[0] || bytes[i + 1] !== signature[1] || bytes[i + 2] !== signature[2] || bytes[i + 3] !== signature[3]) {
      continue
    }

    // 本地文件头固定 30 字节，随后是文件名与扩展区
    const view = new DataView(bytes.buffer, bytes.byteOffset + i)
    const nameLength = view.getUint16(26, true)
    const extraLength = view.getUint16(28, true)
    const nameStart = i + 30
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))

    if (name !== target) continue

    const dataStart = nameStart + nameLength + extraLength
    const compressedSize = view.getUint32(18, true)
    const method = view.getUint16(8, true)
    const data = bytes.subarray(dataStart, dataStart + compressedSize)

    if (method !== 0) {
      throw new Error('这个 .docx 使用了暂不支持的高版本压缩方式，请另存为 .txt 后重试')
    }

    return docxXmlToText(decoder.decode(data))
  }

  throw new Error('未能从这个 .docx 里读到正文，请另存为 .txt 后重试')
}

export interface DocResult {
  text: string
  name: string
}

/** 读取 .txt / .md / .docx */
export async function readDocument(file: File): Promise<DocResult> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.docx')) {
    return { text: await readDocx(file), name: file.name }
  }

  if (name.endsWith('.doc')) {
    throw new Error('旧版 .doc 格式无法直接解析，请在 Word 里另存为 .docx 或 .txt')
  }

  if (name.endsWith('.pdf')) {
    throw new Error('暂不支持 PDF，请把正文复制成文本粘贴，或上传图片走识别通道')
  }

  if (!/\.(txt|md|markdown|text)$/.test(name)) {
    throw new Error('只支持 .txt / .md / .docx，或直接粘贴文本')
  }

  return { text: await readAsText(file), name: file.name }
}
