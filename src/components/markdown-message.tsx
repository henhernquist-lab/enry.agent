'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface MarkdownMessageProps {
  content: string
  isStreaming?: boolean
}

const components: Components = {
  // Code blocks: monospace + distinct background, syntax distinction
  code({ className, children, ...props }) {
    const isInline = !className
    if (isInline) {
      return (
        <code
          className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-[0.85em] text-accent"
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <div className="my-3 overflow-hidden rounded border border-border">
        <div className="border-b border-border bg-surface-elevated px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          code
        </div>
        <pre className="overflow-x-auto bg-[#141210] p-4">
          <code className={`font-mono text-[13px] leading-relaxed text-foreground ${className ?? ''}`} {...props}>
            {children}
          </code>
        </pre>
      </div>
    )
  },
  // Bold: actual bold, primary accent
  strong({ children, ...props }) {
    return (
      <strong className="font-semibold text-primary" {...props}>
        {children}
      </strong>
    )
  },
  // Headers: serif display font for hierarchy
  h1({ children, ...props }) {
    return <h1 className="mt-6 mb-3 font-display text-xl font-bold text-foreground first:mt-0" {...props}>{children}</h1>
  },
  h2({ children, ...props }) {
    return <h2 className="mt-5 mb-2 font-display text-lg font-semibold text-foreground first:mt-0" {...props}>{children}</h2>
  },
  h3({ children, ...props }) {
    return <h3 className="mt-4 mb-2 font-display text-base font-semibold text-foreground first:mt-0" {...props}>{children}</h3>
  },
  // Lists: proper bullets/numbers with spacing
  ul({ children, ...props }) {
    return <ul className="my-2 ml-5 list-disc space-y-1 text-sm text-foreground" {...props}>{children}</ul>
  },
  ol({ children, ...props }) {
    return <ol className="my-2 ml-5 list-decimal space-y-1 text-sm text-foreground" {...props}>{children}</ol>
  },
  li({ children, ...props }) {
    return <li className="pl-1" {...props}>{children}</li>
  },
  // Paragraphs: proper spacing
  p({ children, ...props }) {
    return <p className="my-2 text-sm leading-relaxed text-foreground first:mt-0 last:mb-0" {...props}>{children}</p>
  },
  // Links: bronze accent
  a({ children, href, ...props }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:decoration-primary"
        {...props}
      >
        {children}
      </a>
    )
  },
  // Blockquotes: distinct left border
  blockquote({ children, ...props }) {
    return (
      <blockquote className="my-3 border-l-2 border-primary/40 bg-surface-elevated/50 py-2 pl-4 text-sm italic text-muted-foreground" {...props}>
        {children}
      </blockquote>
    )
  },
  // Horizontal rules
  hr() {
    return <hr className="my-4 border-border" />
  },
  // Tables
  table({ children, ...props }) {
    return (
      <div className="my-3 overflow-x-auto rounded border border-border">
        <table className="w-full text-sm" {...props}>{children}</table>
      </div>
    )
  },
  thead({ children, ...props }) {
    return <thead className="border-b border-border bg-surface-elevated" {...props}>{children}</thead>
  },
  th({ children, ...props }) {
    return <th className="px-3 py-2 text-left font-mono text-[11px] font-semibold text-muted-foreground uppercase tracking-wider" {...props}>{children}</th>
  },
  td({ children, ...props }) {
    return <td className="border-t border-border px-3 py-2 text-foreground" {...props}>{children}</td>
  },
}

export function MarkdownMessage({ content, isStreaming }: MarkdownMessageProps) {
  if (isStreaming) {
    // During streaming, render as plain pre-wrap text (the TypingText animation
    // works on the raw text stream — markdown parsing mid-stream would break
    // the animation and produce broken half-tags)
    return (
      <span className="whitespace-pre-wrap text-sm leading-relaxed text-foreground font-sans">
        {content}
      </span>
    )
  }

  return (
    <div className="markdown-body font-sans">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
