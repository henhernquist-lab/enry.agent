import { Room } from '@/components/room'

export const metadata = {
  title: 'The Atelier — Golem',
  description: 'Golem\'s 3D headquarters — a living visualization of Golem\'s current state',
}

export const dynamic = 'force-dynamic'

export default async function RoomPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; state?: string }>
}) {
  // "See Golem" entry points (Drive/Cruise/Learn) pass which surface opened
  // The Atelier and whether that surface is mid-run — the scene seeds the
  // worker's activity from this instead of the mocked timeline.
  const { from, state } = await searchParams
  return <Room from={from} state={state === 'working' ? 'working' : 'idle'} />
}
