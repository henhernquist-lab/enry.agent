import { test, expect } from 'playwright/test'

test('homepage loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/ENRY|enry/i)
  await expect(page.getByText(/personal AI superagent/i)).toBeVisible()
})

test('auth screen exposes Google and GitHub sign-in entry points', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByTestId('google-signin-button')).toBeVisible()
  await expect(page.getByRole('button', { name: /github/i })).toBeVisible()
})
