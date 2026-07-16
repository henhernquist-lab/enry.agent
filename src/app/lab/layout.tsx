import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Enry Lab',
  description: 'Experimental multi-model features and skill improvement loops.',
}

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  )
}
