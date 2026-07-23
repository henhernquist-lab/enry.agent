import Link from 'next/link'
import { MessageSquare, Swords, Ship, GraduationCap, Smartphone } from 'lucide-react'
import { Card } from '@/components/card'

const MODES = [
  { href: '/chat', label: 'Chat', desc: 'Ask Enry anything', icon: MessageSquare, color: 'text-primary' },
  { href: '/agent', label: 'Drive', desc: 'Autonomous coding agent', icon: Swords, color: 'text-primary' },
  { href: '/cruise', label: 'Cruise', desc: 'Scan-and-fix pipeline', icon: Ship, color: 'text-primary' },
  { href: '/learn', label: 'Learn', desc: 'Tutorials and skills', icon: GraduationCap, color: 'text-primary' },
  { href: '/m/chat', label: 'enry lite', desc: 'Mobile chat', icon: Smartphone, color: 'text-primary' },
]

export function ModeLauncher() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {MODES.map((mode) => (
        <Link key={mode.href} href={mode.href}>
          <Card
            padding="lg"
            className="group h-full transition-colors hover:border-primary/40 hover:bg-surface-elevated"
          >
            <mode.icon className={`mb-3 h-6 w-6 ${mode.color} transition-transform group-hover:scale-110`} />
            <h3 className="text-sm font-semibold text-foreground">{mode.label}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{mode.desc}</p>
          </Card>
        </Link>
      ))}
    </div>
  )
}
