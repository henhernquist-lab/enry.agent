import { Room } from '@/components/room'

export const metadata = {
  title: 'The Room — ENRY.AGENT',
  description: 'Enry\'s 3D headquarters — a living visualization of Enry\'s current state',
}

export const dynamic = 'force-dynamic'

export default function RoomPage() {
  return <Room />
}
