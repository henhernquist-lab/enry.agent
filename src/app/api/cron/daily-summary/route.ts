import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { supabase } from '@/lib/supabase'
import { sendSMS } from '@/lib/sms'

export const maxDuration = 60

export async function GET(req: Request) {
  // Verify this is a legitimate Vercel Cron invocation
  const secret = process.env.CRON_SECRET
  const auth   = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentHour = new Date().getUTCHours()

  // Fetch all profiles that have an SMS phone number configured
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('google_id, name, tools_data, profile_data')
  if (error) {
    console.error('[cron/daily-summary] Supabase fetch error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const results: Array<{ google_id: string; status: string; error?: string }> = []

  for (const profile of profiles ?? []) {
    const toolsData    = profile.tools_data as Record<string, unknown> | null
    const smsSettings  = toolsData?.sms as { phone?: string; time?: string } | undefined

    if (!smsSettings?.phone) continue

    // Check if this hour matches the user's preferred send time (UTC)
    const [prefHour] = (smsSettings.time ?? '08:00').split(':').map(Number)
    if (prefHour !== currentHour) {
      results.push({ google_id: profile.google_id, status: 'skipped (wrong hour)' })
      continue
    }

    try {
      const summary = await generateDailySummary(
        profile.google_id,
        profile.name ?? 'there',
        profile.profile_data as Record<string, unknown> | null,
      )
      const { success, error: smsError } = await sendSMS(smsSettings.phone, summary)
      results.push({ google_id: profile.google_id, status: success ? 'sent' : 'sms_failed', error: smsError ?? undefined })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[cron/daily-summary] Error for', profile.google_id, msg)
      results.push({ google_id: profile.google_id, status: 'error', error: msg })
    }
  }

  return Response.json({ ok: true, hour: currentHour, results })
}

async function generateDailySummary(
  _googleId: string,
  name: string,
  profileData: Record<string, unknown> | null,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.GLM_API_KEY
  const modelId = process.env.DEEPSEEK_API_KEY
    ? 'deepseek-ai/deepseek-v4-pro'
    : 'z-ai/glm-5.2'

  if (!apiKey) throw new Error('No AI model API key configured for daily summary')

  const client = createOpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey,
  })

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })

  // Build a short profile context from profile_data
  let profileContext = ''
  if (profileData) {
    const p = profileData as Record<string, unknown>
    const parts: string[] = []
    if (p.classes)       parts.push(`Classes: ${p.classes}`)
    if (p.sports)        parts.push(`Sports: ${p.sports}`)
    if (p.gpaGoal)       parts.push(`GPA goal: ${p.gpaGoal}`)
    if (p.trainingDays)  parts.push(`Trains: ${p.trainingDays} days/week`)
    if (p.dietGoal)      parts.push(`Diet phase: ${p.dietGoal}`)
    if (p.proteinTarget) parts.push(`Protein target: ${p.proteinTarget}g/day`)
    if (p.wakeTime)      parts.push(`Wakes at: ${p.wakeTime}`)
    if (p.practiceTime)  parts.push(`Practice at: ${p.practiceTime}`)
    if (p.priorities) {
      const pri = p.priorities as Record<string, number>
      const sorted = Object.entries(pri).sort((a, b) => a[1] - b[1]).map(([k]) => k)
      parts.push(`Priorities: ${sorted.join(' > ')}`)
    }
    profileContext = parts.join('\n')
  }

  const { text } = await generateText({
    model: client.chat(modelId),
    messages: [
      {
        role: 'user',
        content: `You are a personal AI assistant sending a morning SMS briefing to ${name}. Today is ${today}.

${profileContext ? `Their profile:\n${profileContext}\n` : ''}
Write a short, energizing daily summary for ${name}. Keep it under 400 characters, no emojis, no markdown, plain text only. Include one concrete thing to focus on today based on their profile (academics, training, or nutrition). End with a short motivating line.`.trim(),
      },
    ],
  })

  return text.trim()
}
