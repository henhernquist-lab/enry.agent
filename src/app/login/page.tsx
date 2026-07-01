'use client'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#000',
      gap: '24px',
    }}>
      <h1 style={{ color: '#00ff41', fontFamily: 'monospace', fontSize: '2rem', letterSpacing: '0.1em' }}>
        enry.agent
      </h1>
      <p style={{ color: '#666', fontFamily: 'monospace', fontSize: '0.9rem' }}>
        personal AI superagent
      </p>
      <button
        onClick={() => signIn('google', { callbackUrl: '/' })}
        style={{
          background: 'transparent',
          border: '1px solid #00ff41',
          color: '#00ff41',
          padding: '12px 32px',
          fontFamily: 'monospace',
          fontSize: '1rem',
          cursor: 'pointer',
          letterSpacing: '0.05em',
        }}
      >
        sign in with google →
      </button>
    </div>
  )
}
