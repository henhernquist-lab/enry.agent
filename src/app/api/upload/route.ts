import { randomUUID } from 'node:crypto'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { detectFileType, mimeFor, extOf, MAX_FILE_SIZE, MAX_EXTRACT_CHARS, SUPPORTED_EXTENSIONS } from '@/lib/uploads'
import { extractPdfText } from '@/lib/pdf-extract'
import { describeImage } from '@/lib/image-vision'

export const maxDuration = 60

const BUCKET = 'user-uploads'
const SIGNED_URL_TTL_SECONDS = 3600

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    const uid = await resolveResourceUserId(userId(session))
    if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: `File too large — max 10MB (this file is ${(file.size / (1024 * 1024)).toFixed(1)}MB)` }, { status: 400 })
    }

    const fileType = detectFileType(file.name)
    if (!fileType) {
      return Response.json({
        error: `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const storagePath = `${uid}/${randomUUID()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.type || mimeFor(file.name), upsert: false })

    if (uploadError) {
      console.error('[upload] storage upload failed:', uploadError)
      return Response.json({ error: 'Failed to store file' }, { status: 500 })
    }

    let extractedSummary = ''
    let truncated = false
    let signedUrl: string | null = null

    if (fileType === 'image') {
      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
      if (signError || !signed) {
        await supabase.storage.from(BUCKET).remove([storagePath])
        return Response.json({ error: 'Failed to prepare image for analysis' }, { status: 500 })
      }
      signedUrl = signed.signedUrl

      const { description, error: visionError } = await describeImage(signedUrl, file.type || mimeFor(file.name))
      if (visionError || !description) {
        await supabase.storage.from(BUCKET).remove([storagePath])
        return Response.json({ error: visionError ?? 'Could not analyze this image' }, { status: 502 })
      }
      extractedSummary = description
    } else if (fileType === 'pdf') {
      const { text, error: pdfError } = await extractPdfText(buffer)
      if (pdfError || !text) {
        await supabase.storage.from(BUCKET).remove([storagePath])
        return Response.json({ error: pdfError ?? 'Could not extract text from this PDF' }, { status: 422 })
      }
      truncated = text.length > MAX_EXTRACT_CHARS
      extractedSummary = truncated ? text.slice(0, MAX_EXTRACT_CHARS) : text
    } else {
      const text = buffer.toString('utf-8').trim()
      if (!text) {
        await supabase.storage.from(BUCKET).remove([storagePath])
        return Response.json({ error: 'File appears to be empty' }, { status: 422 })
      }
      truncated = text.length > MAX_EXTRACT_CHARS
      extractedSummary = truncated ? text.slice(0, MAX_EXTRACT_CHARS) : text
    }

    return Response.json({
      filename: file.name,
      file_type: fileType,
      mime_type: file.type || mimeFor(file.name),
      size: file.size,
      storage_path: storagePath,
      extracted_summary: extractedSummary,
      truncated,
      image_url: signedUrl,
      extension: extOf(file.name),
    })
  } catch (err) {
    console.error('[upload] unhandled error:', err)
    return Response.json({
      error: `Server error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 })
  }
}
