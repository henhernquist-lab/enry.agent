import { supabase } from '@/lib/supabase'
import { isTableMissing } from '@/lib/usage/log'

// Durable index of cloud terminal sessions, so a session created by one lambda
// can be found by the next one. See the 20260805020000_terminal_sessions
// migration for why this has to exist at all.
//
// Every function here is best-effort: a missing table (migration not applied
// yet) or any DB error degrades to the previous in-memory-only behaviour
// rather than breaking the terminal. Callers treat a null/false result as
// "not durable", never as "fatal".

export interface StoredSession {
  id: string
  spriteName: string
  spriteSessionId: string | null
  cols: number
  rows: number
  exited: boolean
}

interface Row {
  id: string
  sprite_name: string
  sprite_session_id: string | null
  cols: number
  rows: number
  exited: boolean
}

function logIfReal(scope: string, error: { message?: string } | null): void {
  if (error && !isTableMissing(error)) {
    console.error(`[session-store] ${scope} failed:`, error.message)
  }
}

export async function persistSession(session: StoredSession): Promise<void> {
  try {
    const { error } = await supabase.from('cloud_terminal_sessions').upsert(
      {
        id: session.id,
        sprite_name: session.spriteName,
        sprite_session_id: session.spriteSessionId,
        cols: session.cols,
        rows: session.rows,
        exited: session.exited,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    logIfReal('persist', error)
  } catch (e) {
    console.error('[session-store] persist threw:', e)
  }
}

export async function loadSession(id: string): Promise<StoredSession | null> {
  try {
    const { data, error } = await supabase
      .from('cloud_terminal_sessions')
      .select('id, sprite_name, sprite_session_id, cols, rows, exited')
      .eq('id', id)
      .maybeSingle()
    if (error) {
      logIfReal('load', error)
      return null
    }
    if (!data) return null
    const row = data as Row
    return {
      id: row.id,
      spriteName: row.sprite_name,
      spriteSessionId: row.sprite_session_id,
      cols: row.cols,
      rows: row.rows,
      exited: row.exited,
    }
  } catch (e) {
    console.error('[session-store] load threw:', e)
    return null
  }
}

/**
 * Record the Sprites-side exec id once its session_info frame arrives. Without
 * this a rehydrating instance can't reattach and would spawn a second shell,
 * losing the user's scrollback and running processes.
 */
export async function updateSpriteSessionId(id: string, spriteSessionId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('cloud_terminal_sessions')
      .update({ sprite_session_id: spriteSessionId, last_active_at: new Date().toISOString() })
      .eq('id', id)
    logIfReal('updateSpriteSessionId', error)
  } catch (e) {
    console.error('[session-store] updateSpriteSessionId threw:', e)
  }
}

export async function touchSession(id: string, cols?: number, rows?: number): Promise<void> {
  try {
    const patch: Record<string, unknown> = { last_active_at: new Date().toISOString() }
    if (typeof cols === 'number') patch.cols = cols
    if (typeof rows === 'number') patch.rows = rows
    const { error } = await supabase.from('cloud_terminal_sessions').update(patch).eq('id', id)
    logIfReal('touch', error)
  } catch (e) {
    console.error('[session-store] touch threw:', e)
  }
}

export async function markExited(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('cloud_terminal_sessions').update({ exited: true }).eq('id', id)
    logIfReal('markExited', error)
  } catch (e) {
    console.error('[session-store] markExited threw:', e)
  }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('cloud_terminal_sessions').delete().eq('id', id)
    logIfReal('delete', error)
  } catch (e) {
    console.error('[session-store] delete threw:', e)
  }
}
