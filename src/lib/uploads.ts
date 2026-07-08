export type UploadFileType = 'image' | 'pdf' | 'text'

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_EXTRACT_CHARS = 20000 // matches the github_read_file truncation cap

const EXTENSION_TYPE: Record<string, UploadFileType> = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image',
  pdf: 'pdf',
  txt: 'text', md: 'text', js: 'text', jsx: 'text', ts: 'text', tsx: 'text',
  py: 'text', json: 'text', css: 'text', html: 'text', yml: 'text', yaml: 'text',
  sh: 'text', go: 'text', rs: 'text', java: 'text', c: 'text', cpp: 'text', rb: 'text',
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain', md: 'text/markdown',
}

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_TYPE)

export function extOf(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

export function detectFileType(filename: string): UploadFileType | null {
  return EXTENSION_TYPE[extOf(filename)] ?? null
}

export function mimeFor(filename: string): string {
  return MIME_BY_EXTENSION[extOf(filename)] ?? 'application/octet-stream'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
