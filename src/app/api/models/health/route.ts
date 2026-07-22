import { getAllHealth } from '@/lib/model-intelligence'

export const maxDuration = 10

export async function GET() {
  const health = getAllHealth()
  return Response.json({ health })
}
