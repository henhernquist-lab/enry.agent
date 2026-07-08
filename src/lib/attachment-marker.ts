import { formatBytes, type UploadFileType } from './uploads'

export interface AttachmentMeta {
  filename: string
  file_type: UploadFileType
  mime_type: string
  size: number
  storage_path: string
  extracted_summary: string
  truncated: boolean
  image_url?: string | null
}

const MARKER_PREFIX = '<!--enry-attachment:'
const MARKER_SUFFIX = '-->'
const ATTACHMENT_END = '---END-ATTACHMENT---'

// Embeds attachment metadata + a human-readable context block ahead of the
// user's question in the plain text sent to the model. The marker survives
// round-tripping through the `messages` table (stored as-is in message_data)
// with zero schema changes, and is stripped back out on render via parseMessageText.
export function buildMessageText(attachment: AttachmentMeta, userText: string): string {
  const header = `[Attached: ${attachment.filename} — ${attachment.file_type}, ${formatBytes(attachment.size)}]`
  const body = attachment.file_type === 'image'
    ? `Image description: ${attachment.extracted_summary}`
    : `${attachment.truncated ? '[truncated to first ~20,000 characters] ' : ''}File contents:\n${attachment.extracted_summary}`
  const question = userText.trim() || 'What does this file say? Summarize it and point out anything important.'

  return [
    `${MARKER_PREFIX}${JSON.stringify(attachment)}${MARKER_SUFFIX}`,
    header,
    body,
    ATTACHMENT_END,
    question,
  ].join('\n')
}

export function parseMessageText(text: string): { attachment: AttachmentMeta | null; displayText: string } {
  if (!text.startsWith(MARKER_PREFIX)) return { attachment: null, displayText: text }

  const markerEnd = text.indexOf(MARKER_SUFFIX)
  if (markerEnd === -1) return { attachment: null, displayText: text }

  let attachment: AttachmentMeta | null = null
  try {
    attachment = JSON.parse(text.slice(MARKER_PREFIX.length, markerEnd)) as AttachmentMeta
  } catch {
    return { attachment: null, displayText: text }
  }

  const endIdx = text.indexOf(ATTACHMENT_END, markerEnd)
  const displayText = endIdx === -1
    ? text.slice(markerEnd + MARKER_SUFFIX.length).trim()
    : text.slice(endIdx + ATTACHMENT_END.length).trim()

  return { attachment, displayText }
}
