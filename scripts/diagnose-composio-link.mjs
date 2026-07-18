// Diagnostic: reproduce the exact Composio connectedAccounts.link call
// Run with: node scripts/diagnose-composio-link.mjs
import { Composio } from '@composio/core'

const apiKey = process.env.COMPOSIO_API_KEY
const gmailAuthConfigId = process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID
const calendarAuthConfigId = process.env.COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID

console.log('ENV CHECK:')
console.log('  COMPOSIO_API_KEY present:', !!apiKey)
console.log('  COMPOSIO_GMAIL_AUTH_CONFIG_ID:', gmailAuthConfigId)
console.log('  COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID:', calendarAuthConfigId)

if (!apiKey || !gmailAuthConfigId) {
  console.error('Missing COMPOSIO_API_KEY or COMPOSIO_GMAIL_AUTH_CONFIG_ID')
  process.exit(1)
}

const composio = new Composio({ apiKey })

async function tryLink(toolkit, authConfigId) {
  const userId = `diagnostic-user-${Date.now()}`
  const callbackUrl = 'https://example.com/callback'
  console.log(`\n--- Trying ${toolkit} with auth_config_id ${authConfigId} ---`)
  try {
    const req = await composio.connectedAccounts.link(userId, authConfigId, { callbackUrl })
    console.log('SUCCESS:', { id: req.id, redirectUrl: req.redirectUrl, status: req.status })
  } catch (e) {
    console.error('CAUGHT ERROR:')
    console.error('  name:', e.name)
    console.error('  message:', e.message)
    console.error('  code:', e.code)
    console.error('  statusCode:', e.statusCode)
    console.error('  cause:', e.cause)
    if (e.cause) {
      console.error('  cause.name:', e.cause.name)
      console.error('  cause.message:', e.cause.message)
      console.error('  cause.status:', e.cause.status)
      console.error('  cause.statusCode:', e.cause.statusCode)
      console.error('  cause.body:', e.cause.body)
      console.error('  cause.response:', e.cause.response)
      console.error('  cause.headers:', e.cause.headers)
      console.error('  cause.stack:', e.cause.stack)
    }
    console.error('  full error keys:', Object.keys(e))
    console.error('  full error:', e)
  }
}

await tryLink('gmail', gmailAuthConfigId)
if (calendarAuthConfigId) await tryLink('googlecalendar', calendarAuthConfigId)
