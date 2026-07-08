import { PDFParse } from 'pdf-parse'

export async function extractPdfText(buffer: Buffer): Promise<{ text: string | null; error: string | null }> {
  let parser: PDFParse | null = null
  try {
    parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    // Strip pdf-parse's "-- N of M --" page-separator footers — noise for the model.
    const text = (result.text ?? '').replace(/\n*--\s*\d+\s*of\s*\d+\s*--\n*/g, '\n').trim()
    if (!text) return { text: null, error: 'No extractable text found — the PDF may be scanned images or empty.' }
    return { text, error: null }
  } catch (err) {
    console.error('[pdf-extract] failed:', err)
    return { text: null, error: 'Could not read this PDF — it may be corrupted or password-protected.' }
  } finally {
    await parser?.destroy()
  }
}
