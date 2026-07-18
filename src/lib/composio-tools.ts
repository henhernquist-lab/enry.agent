// AI SDK tool wrappers for the Composio-backed Connectors (Gmail + Google
// Calendar, v1). Each tool is a hand-rolled Vercel AI SDK `tool()` block — at
// v1 we only expose a deliberate read-only allowlist of actions:
//
//   Gmail:      GMAIL_FETCH_EMAILS, GMAIL_GET_MESSAGE, GMAIL_SEARCH_EMAILS
//   Calendar:   GOOGLECALENDAR_LIST_EVENTS, GOOGLECALENDAR_GET_EVENT,
//               GOOGLECALENDAR_FIND_EVENT
//
// Why hard-coded Zod schemas (not SDK-fetched)? Two reasons:
//   1. Latency — pulling a fresh schema per chat call would cost 200-500ms per
//      tool on a hot path that already runs 7+ tool-calling steps per turn.
//   2. Stability — the model always sees the same shape, so hand-tuned
//      descriptions and parameter docs stay consistent across releases.
//
// The execute handler looks up the user's connected_account_id from
// `composio_connections` and calls Composio's SDK to actually run the action.
// Composio fully custodies the underlying Google OAuth tokens; we never see
// them. Tool results are returned to the model exactly as Composio returns
// them, after a tiny envelope so the model can distinguish success/failure.

import { tool } from 'ai'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { executeTool, type ComposioToolkit } from '@/lib/composio'
import type { FocusMode } from '@/lib/focus-mode'

type ConnectionStatus = 'disconnected' | 'pending' | 'connected' | 'error'

interface ComposioRow {
  toolkit: ComposioToolkit
  status: ConnectionStatus
  composio_connected_account_id: string | null
}

// Reads composio_connections for this user. Returns the connected_account_id
// per toolkit where the status is 'connected'. Called once per chat turn
// (cached for the turn's lifetime by the caller via the closure).
async function loadConnections(uid: string): Promise<Partial<Record<ComposioToolkit, string>>> {
  try {
    const { data } = await supabase
      .from('composio_connections')
      .select('toolkit, status, composio_connected_account_id')
      .eq('user_id', uid)
    const out: Partial<Record<ComposioToolkit, string>> = {}
    for (const row of (data ?? []) as ComposioRow[]) {
      if (row.status === 'connected' && row.composio_connected_account_id) {
        out[row.toolkit as ComposioToolkit] = row.composio_connected_account_id
      }
    }
    return out
  } catch (e) {
    console.error('[composio-tools] failed to load connections:', e)
    return {}
  }
}

const FOCUS_ALLOWS: Record<string, boolean> = {
  all: true,
  memory_only: true,
  web_only: false,
  repo_only: false,
}

// Wraps a single Composio slug as an AI SDK tool. Returns the tool if the user
// has an active connection for that toolkit, else returns null so the tool
// list remains honest (the model doesn't see a tool it can't actually call).
async function wrapTool(args: {
  slug: string
  toolkitName: 'Gmail' | 'Google Calendar'
  description: string
  inputSchema: z.ZodTypeAny
  userId: string
  toolKey: string
}): Promise<Record<string, any> | null> {
  return {
    [args.toolKey]: tool({
      description: args.description,
      inputSchema: args.inputSchema,
      execute: async (raw: unknown) => {
        const body = (raw ?? {}) as Record<string, unknown>
        // Composio resolves the connected account internally from the
        // (userId, authConfigId) pair registered during connect; no need to
        // pass connected_account_id through to execute().
        const { data, error } = await executeTool(args.userId, args.slug, body)
        if (error) {
          // Always surface the failure to the model as a structured result,
          // never throw — throwing aborts the whole tool-calling step in the
          // AI SDK, and the model can't recover.
          return { success: false, error, toolkit: args.toolkitName, slug: args.slug }
        }
        return { success: true, toolkit: args.toolkitName, slug: args.slug, data }
      },
    }),
  }
}

// Builds the composio-aware subset of the chat tools map for one turn. Reads
// the user's connections on demand, only attaches tools for toolkits where the
// user is actually connected (no point handing the model a tool that would
// just fail-401 on execute). Returns {} for focus modes that disallow composio.
export async function buildComposioTools(uid: string | null, focusMode: FocusMode): Promise<Record<string, any>> {
  if (!uid) return {}
  if (!FOCUS_ALLOWS[focusMode]) return {}

  const connections = await loadConnections(uid)
  const tools: Record<string, any> = {}
  // loadConnections returns composio_connected_account_id per toolkit, but the
  // SDK doesn't need that ID at execute time — it resolves the connected
  // account internally from the (userId, authConfigId) pair registered during
  // connect. Pass userId through to executeTool; the per-toolkit connection
  // is just a presence check ("is this user authorized for gmail at all?").
  const hasGmail = Boolean(connections.gmail)
  const hasGCal = Boolean(connections.googlecalendar)

  if (hasGmail) {
    const gmailTools = await Promise.all([
      wrapTool({
        slug: 'GMAIL_FETCH_EMAILS',
        toolkitName: 'Gmail',
        description: 'Fetch a list of recent emails from Gmail. Returns subject, from, date, and a short preview of each message. Use this when the user asks about recent emails, inbox contents, or wants to know what came in.',
        inputSchema: z.object({
          max_results: z.number().int().min(1).max(50).optional().describe('How many recent messages to return. Default 10.'),
          query: z.string().optional().describe('Optional Gmail search query (e.g. "from:github.com", "subject:invoice", "is:unread"). If omitted, returns the most recent messages.'),
        }),
        userId: uid,
        toolKey: 'gmail_fetch_emails',
      }),
      wrapTool({
        slug: 'GMAIL_GET_MESSAGE',
        toolkitName: 'Gmail',
        description: 'Fetch a single Gmail message by ID. Returns the full message body, headers, and metadata. Use after gmail_fetch_emails when the user asks to read or quote a specific email.',
        inputSchema: z.object({
          message_id: z.string().describe('The Gmail message ID (returned by gmail_fetch_emails).'),
        }),
        userId: uid,
        toolKey: 'gmail_get_message',
      }),
      wrapTool({
        slug: 'GMAIL_SEARCH_EMAILS',
        toolkitName: 'Gmail',
        description: 'Search Gmail using a query string. Returns matching messages with subject, from, date. Use when the user asks for emails matching a specific sender, subject, or filter.',
        inputSchema: z.object({
          query: z.string().describe('Gmail search query, e.g. "from:stripe.com subject:payment".'),
          max_results: z.number().int().min(1).max(50).optional().describe('Max results. Default 10.'),
        }),
        userId: uid,
        toolKey: 'gmail_search_emails',
      }),
    ])
    for (const t of gmailTools) if (t) Object.assign(tools, t)
  }

  if (hasGCal) {
    const calTools = await Promise.all([
      wrapTool({
        slug: 'GOOGLECALENDAR_LIST_EVENTS',
        toolkitName: 'Google Calendar',
        description: 'List upcoming events on the user\'s primary Google Calendar within an optional time window. Returns event title, start/end time, attendees, and location.',
        inputSchema: z.object({
          max_results: z.number().int().min(1).max(50).optional().describe('Max events. Default 10.'),
          time_min: z.string().optional().describe('ISO 8601 lower bound, e.g. "2025-07-17T00:00:00Z". Default: now.'),
          time_max: z.string().optional().describe('ISO 8601 upper bound, e.g. "2025-07-18T00:00:00Z". Default: 7 days from now.'),
        }),
        userId: uid,
        toolKey: 'googlecalendar_list_events',
      }),
      wrapTool({
        slug: 'GOOGLECALENDAR_GET_EVENT',
        toolkitName: 'Google Calendar',
        description: 'Fetch a single calendar event by ID. Returns full details including attendees, description, and conference link.',
        inputSchema: z.object({
          event_id: z.string().describe('The Google Calendar event ID.'),
        }),
        userId: uid,
        toolKey: 'googlecalendar_get_event',
      }),
      wrapTool({
        slug: 'GOOGLECALENDAR_FIND_EVENT',
        toolkitName: 'Google Calendar',
        description: 'Find a calendar event by search query (matches title, description, attendees). Useful for "what meeting do I have with X tomorrow".',
        inputSchema: z.object({
          query: z.string().describe('Free-text search query.'),
          max_results: z.number().int().min(1).max(20).optional().describe('Max events. Default 5.'),
        }),
        userId: uid,
        toolKey: 'googlecalendar_find_event',
      }),
    ])
    for (const t of calTools) if (t) Object.assign(tools, t)
  }

  return tools
}
