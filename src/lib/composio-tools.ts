// AI SDK tool wrappers for the Composio-backed Connectors (Gmail + Composio
// Search, v1). Each tool is a hand-rolled Vercel AI SDK `tool()` block — at
// v1 we only expose a deliberate read-only allowlist of actions:
//
//   Gmail:      GMAIL_FETCH_EMAILS, GMAIL_GET_MESSAGE, GMAIL_SEARCH_EMAILS
//   Search:     COMPOSIO_SEARCH_DUCKDUCKGO_SEARCH,
//               COMPOSIO_SEARCH_FETCH_URL_CONTENT,
//               COMPOSIO_SEARCH_FINANCE,
//               COMPOSIO_SEARCH_FLIGHTS,
//               COMPOSIO_SEARCH_AMAZON
//
// Why hand-rolled Zod schemas: see the Composio Gmail wrapper comment for the
// full rationale (latency, stability, hand-tuned descriptions). Same
// reasoning applies here — every composio_search action uses the same
// executeTool path, and we choose which actions to expose based on what's
// genuinely useful vs. what would just add latency/noise to the tool list.

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
  web_only: true,
  repo_only: false,
}

// Wraps a single Composio slug as an AI SDK tool. Returns the tool if the user
// has an active connection for that toolkit, else returns null so the tool
// list remains honest (the model doesn't see a tool it can't actually call).
async function wrapTool(args: {
  slug: string
  toolkitName: 'Gmail' | 'Google Calendar' | 'Composio Search'
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
  const hasSearch = Boolean(connections.composio_search)

  if (hasSearch) {
    const searchTools = await Promise.all([
      wrapTool({
        slug: 'COMPOSIO_SEARCH_DUCKDUCKGO_SEARCH',
        toolkitName: 'Composio Search',
        description: 'General web search via DuckDuckGo. Returns titles, URLs, and snippets for search results. Use this for broad research, fact-checking, or finding information online — distinct from Tavily web_search which is better for deep research. Prefer this for quick lookups, price checks, and transactional queries.',
        inputSchema: z.object({
          query: z.string().describe('The search query.'),
          max_results: z.number().int().min(1).max(20).optional().describe('Number of results. Default 5.'),
        }),
        userId: uid,
        toolKey: 'composio_web_search',
      }),
      wrapTool({
        slug: 'COMPOSIO_SEARCH_FETCH_URL_CONTENT',
        toolkitName: 'Composio Search',
        description: 'Scrape and extract clean markdown content from a specific URL. Use this to read the full text of a page — unlike search snippets, this returns the actual page content. Good for checking prices, availability, or reading docs directly from a source page.',
        inputSchema: z.object({
          url: z.string().url().describe('The full URL to scrape.'),
        }),
        userId: uid,
        toolKey: 'composio_fetch_url',
      }),
      wrapTool({
        slug: 'COMPOSIO_SEARCH_FINANCE',
        toolkitName: 'Composio Search',
        description: 'Get real-time financial data: stock prices, crypto prices, market indices, and company financials. Use this when the user asks about a stock price, crypto value, or market data — this returns live data, not stale training data.',
        inputSchema: z.object({
          query: z.string().describe('The ticker symbol or financial query (e.g. "AAPL", "BTC-USD", "S&P 500").'),
        }),
        userId: uid,
        toolKey: 'composio_finance',
      }),
      wrapTool({
        slug: 'COMPOSIO_SEARCH_FLIGHTS',
        toolkitName: 'Composio Search',
        description: 'Search for flight schedules, routes, and pricing. Use this when the user asks about flight availability, prices between cities, or travel options. Returns real flight data, not estimates.',
        inputSchema: z.object({
          origin: z.string().describe('Origin airport code or city (e.g. "ATL", "New York").'),
          destination: z.string().describe('Destination airport code or city (e.g. "LAX", "London").'),
          date: z.string().optional().describe('Departure date in YYYY-MM-DD format. If omitted, searches soonest.'),
        }),
        userId: uid,
        toolKey: 'composio_flights',
      }),
      wrapTool({
        slug: 'COMPOSIO_SEARCH_AMAZON',
        toolkitName: 'Composio Search',
        description: 'Search Amazon product listings worldwide. Returns product names, prices, ratings, and availability. Use this when the user asks about a product, wants to check prices, or is comparison shopping.',
        inputSchema: z.object({
          query: z.string().describe('The product to search for (e.g. "mechanical keyboard", "Sony WH-1000XM5").'),
          max_results: z.number().int().min(1).max(10).optional().describe('Number of results. Default 5.'),
        }),
        userId: uid,
        toolKey: 'composio_amazon',
      }),
    ])
    for (const t of searchTools) if (t) Object.assign(tools, t)
  }

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

  return tools
}
