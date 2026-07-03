import twilio from 'twilio'

/** Normalise any US phone format to E.164 (+1XXXXXXXXXX). */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return phone // already formatted or international — pass through
}

export async function sendSMS(
  to: string,
  message: string,
): Promise<{ success: boolean; error: string | null }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const from       = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !from) {
    return { success: false, error: 'Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)' }
  }

  try {
    const client = twilio(accountSid, authToken)
    await client.messages.create({ body: message, from, to: toE164(to) })
    return { success: true, error: null }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
