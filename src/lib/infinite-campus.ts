// Infinite Campus student portal scraper — read-only.
// Infinite Campus has NO public student API. This uses Playwright to log in
// with stored credentials, navigate to the assignments and announcements
// views, and parse the rendered page.
//
// Required env vars:
//   IC_USERNAME  — Henry's Infinite Campus login (student ID or username)
//   IC_PASSWORD  — Henry's Infinite Campus password
//
// Portal URL: https://ic.apsk12.org/campus/portal/students/atlanta.jsp
//
// IMPORTANT — credential risk tier: this stores a real personal login
// (username + password), not just an API key. Henry explicitly confirmed
// this is acceptable. The credentials are only accessed server-side and
// never exposed to the client.

import { chromium, Browser, Page } from 'playwright'

const PORTAL_URL = 'https://ic.apsk12.org/campus/portal/students/atlanta.jsp'

export interface ICAssignment {
  name: string
  course: string
  dueDate: string | null
  category: string | null
  score: string | null
  totalPoints: string | null
  status: string | null
}

export interface ICAnnouncement {
  course: string
  text: string
  date: string | null
}

// ── Browser management ──────────────────────────────────────────────────────

let _browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser
  _browser = await chromium.launch({ headless: true })
  return _browser
}

// ── Login ───────────────────────────────────────────────────────────────────

async function login(): Promise<{ page: Page; error: string | null }> {
  const username = process.env.IC_USERNAME
  const password = process.env.IC_PASSWORD
  if (!username || !password) {
    return { page: null as unknown as Page, error: 'Infinite Campus is not configured. Set IC_USERNAME and IC_PASSWORD in env vars.' }
  }

  let browser: Browser
  try {
    browser = await getBrowser()
  } catch (e) {
    return { page: null as unknown as Page, error: `Failed to launch browser: ${String(e)}` }
  }

  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Navigate to login page
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 30_000 })

    // The IC portal shows a login form with username/password fields.
    // Field names vary by district but typically are: username, password
    await page.fill('input[name="username"]', username)
    await page.fill('input[name="password"]', password)
    await page.click('input[type="submit"], button[type="submit"], #loginButton, .login-button')

    // Wait for navigation to the student dashboard
    await page.waitForURL(/campus\/portal\/students\/atlanta\.jsp/, {
      timeout: 20_000,
      waitUntil: 'networkidle',
    })

    // Check for login failure (look for error messages)
    const errorMsg = await page.$('.error-message, .alert-danger, #errorMessage')
    if (errorMsg) {
      const text = await errorMsg.textContent()
      await context.close()
      return { page: null as unknown as Page, error: `IC login failed: ${text?.trim() ?? 'unknown error'}` }
    }

    return { page, error: null }
  } catch (e) {
    await context.close()
    return { page: null as unknown as Page, error: `IC login failed: ${String((e as Error)?.message ?? e)}` }
  }
}

// ── Scrape assignments ──────────────────────────────────────────────────────

export async function getAssignments(): Promise<{
  assignments: ICAssignment[]
  error: string | null
}> {
  const { page, error: loginError } = await login()
  if (loginError) return { assignments: [], error: loginError }

  try {
    const context = page.context()

    // Navigate to the grades/assignments view. The exact URL path varies by
    // district, but typically: /campus/portal/students/atlanta.jsp then
    // click "Grades" or navigate to the grades tab.
    //
    // Common pattern: the student portal has a "Grades" link/button that
    // loads the gradebook view with assignments.
    await page.goto('https://ic.apsk12.org/campus/portal/students/atlanta.jsp', {
      waitUntil: 'networkidle',
      timeout: 20_000,
    })

    // Try clicking the Grades tab/link — IC portals typically have a tab
    // navigation with links like "Grades", "Schedule", "Reports", etc.
    const gradesTab = await page.$('a[href*="grades"], a:has-text("Grades"), #grades, .tab-grades')
    if (gradesTab) {
      await gradesTab.click()
      await page.waitForLoadState('networkidle')
    }

    // Parse assignment rows from the gradebook table.
    // IC's DOM structure uses tables with class names like .gradebook-table,
    // .assignment-table, or plain <table> inside a content area.
    const rawRows = await page.$$eval(
      'table tr, .assignment-row, .gradebook-row, [data-row]',
      (els) =>
        els
          .map((el) => {
            const cells = el.querySelectorAll('td, th')
            if (cells.length < 3) return null
            const texts = Array.from(cells).map((c) => c.textContent?.trim() ?? '')
            return {
              name: texts[0] ?? '',
              course: texts[1] ?? '',
              dueDate: texts[2] || null,
              category: texts[3] || null,
              score: texts[4] || null,
              totalPoints: texts[5] || null,
              status: texts[6] || null,
            }
          })
          .filter(
            (r): r is { name: string; course: string; dueDate: string | null; category: string | null; score: string | null; totalPoints: string | null; status: string | null } =>
              r !== null && r.name.length > 0 && !r.name.includes('Assignment'),
          ),
    )

    const rows: ICAssignment[] = rawRows

    await context.close()
    return { assignments: rows, error: null }
  } catch (e) {
    await page.context().close()
    return {
      assignments: [],
      error: `IC scrape failed: ${String((e as Error)?.message ?? e)}`,
    }
  }
}

// ── Scrape announcements ────────────────────────────────────────────────────

export async function getAnnouncements(): Promise<{
  announcements: ICAnnouncement[]
  error: string | null
}> {
  const { page, error: loginError } = await login()
  if (loginError) return { announcements: [], error: loginError }

  try {
    const context = page.context()

    await page.goto('https://ic.apsk12.org/campus/portal/students/atlanta.jsp', {
      waitUntil: 'networkidle',
      timeout: 20_000,
    })

    // Announcements typically appear on the portal home/dashboard page
    // or under a dedicated "Announcements" section. Look for common containers.
    const items = await page.$$eval(
      '.announcement-item, .message-item, .notification-item, .portal-announcement, .dashboard-message',
      (els) =>
        els.map((el) => {
          const text = el.textContent?.trim() ?? ''
          const course = el.querySelector('.course-name, .class-name, .subject')?.textContent?.trim() ?? 'General'
          const date = el.querySelector('.date, .timestamp, .time')?.textContent?.trim() ?? null
          return { course, text, date }
        }),
    )

    // Fallback: if no announcement-specific elements found, check for
    // dashboard content blocks that might contain announcements.
    if (items.length === 0) {
      const blocks = await page.$$eval(
        '.dashboard-widget, .portal-block, .content-block, .message-block',
        (els) =>
          els.map((el) => {
            const header = el.querySelector('h2, h3, h4, .block-title')?.textContent?.trim()
            const text = el.textContent?.trim() ?? ''
            const date = el.querySelector('.date, .timestamp')?.textContent?.trim() ?? null
            return { course: header ?? 'General', text, date }
          }),
      )
      await context.close()
      return { announcements: blocks, error: null }
    }

    await context.close()
    return { announcements: items, error: null }
  } catch (e) {
    await page.context().close()
    return {
      announcements: [],
      error: `IC scrape failed: ${String((e as Error)?.message ?? e)}`,
    }
  }
}
