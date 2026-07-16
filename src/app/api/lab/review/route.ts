import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { supabase } from '@/lib/supabase'
import { getSkill } from '@/lib/skills/registry'
import { insertPromptRevision } from '@/lib/lab/db'
import { generateText } from 'ai'
import { nimClientFor, DEFAULT_NIM_MODEL } from '@/lib/nim'

export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const skillSlug = typeof body.skill_slug === 'string' ? body.skill_slug : undefined

  if (!skillSlug) {
    return Response.json({ error: 'skill_slug is required' }, { status: 400 })
  }

  const skill = getSkill(skillSlug)
  if (!skill) {
    return Response.json({ error: 'Unknown skill' }, { status: 400 })
  }

  // Fetch recent invocations with explicit feedback or negative implicit signals.
  const { data: rows, error } = await supabase
    .from('skill_invocations')
    .select('*')
    .eq('user_id', uid)
    .eq('skill_slug', skillSlug)
    .or('explicit_feedback.in.(missed,corrected),implicit_score.lt.0')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[lab/review] query failed:', error)
    return Response.json({ error: 'Failed to load invocation history' }, { status: 500 })
  }

  const invocations = rows ?? []
  if (invocations.length === 0) {
    return Response.json({ error: 'No negative signal data for this skill yet' }, { status: 400 })
  }

  const helpfulCount = invocations.filter((r) => r.explicit_feedback === 'helpful').length
  const missedCount = invocations.filter((r) => r.explicit_feedback === 'missed' || r.explicit_feedback === 'corrected').length
  const total = invocations.length
  const winRateBefore = total > 0 ? helpfulCount / total : 0

  // Build a concise summary for the LLM.
  const historyText = invocations
    .map((r, i) => {
      const feedback = r.explicit_feedback ? `[${r.explicit_feedback}]` : `[implicit_score: ${r.implicit_score}]`
      return `--- Invocation ${i + 1} ${feedback} ---\nInput: ${r.input_topic.slice(0, 500)}\nOutput: ${r.output_text.slice(0, 800)}`
    })
    .join('\n\n')

  const prompt = `You are reviewing a skill's invocation history to propose a better system prompt.

Skill: ${skill.name} (${skill.slug})
Current prompt:
---
${skill.systemPrompt}
---

Recent invocations (most recent first):
${historyText}

Win rate before: ${(winRateBefore * 100).toFixed(0)}% (${helpfulCount} helpful / ${total} total with negative signal).

Propose a revised system prompt that addresses the failure patterns above. Output ONLY valid JSON in this exact shape (no markdown fences):

{
  "proposed_prompt": "the full revised system prompt",
  "reasoning": "2-3 sentences on what changed and why"
}

Keep the prompt length and tone similar to the original. Do not change the skill's core purpose.`

  try {
    const client = nimClientFor(DEFAULT_NIM_MODEL)
    const { text } = await generateText({
      model: client.chat(DEFAULT_NIM_MODEL),
      system: 'You are a prompt-engineering assistant. Output only valid JSON.',
      prompt,
      temperature: 0.7,
      maxOutputTokens: 4000,
      timeout: 60_000,
      maxRetries: 1,
    })

    const parsed = JSON.parse(text)
    if (!parsed.proposed_prompt || !parsed.reasoning) {
      throw new Error('Missing proposed_prompt or reasoning')
    }

    const revision = await insertPromptRevision(uid, {
      skill_slug: skillSlug,
      old_prompt: skill.systemPrompt,
      proposed_prompt: parsed.proposed_prompt,
      reasoning: parsed.reasoning,
      status: 'proposed',
      override_active: false,
      sample_invocation_ids: invocations.map((r) => r.id),
      win_rate_before: winRateBefore,
      estimated_win_rate_after: null,
      proposed_at: new Date().toISOString(),
      reviewed_at: null,
    })

    return Response.json({ revision })
  } catch (err) {
    console.error('[lab/review] generation failed:', err)
    return Response.json({ error: 'Failed to generate revision' }, { status: 500 })
  }
}
