// Colors a unified diff string for the terminal — green additions, red
// deletions, muted hunk headers/context. The diff text itself is generated
// server-side (src/lib/terminal/diff.ts, the `diff` package) so this only
// needs to classify lines, not parse diff semantics.
export function DiffView({ diffText }: { diffText: string }) {
  const lines = diffText.split('\n')

  return (
    <pre className="mb-1 overflow-x-auto whitespace-pre break-words">
      {lines.map((line, i) => {
        let className = 'text-foreground/70'
        if (line.startsWith('+++') || line.startsWith('---')) {
          className = 'text-muted-foreground'
        } else if (line.startsWith('+')) {
          className = 'text-primary'
        } else if (line.startsWith('-')) {
          className = 'text-red-400'
        } else if (line.startsWith('@@')) {
          className = 'text-accent'
        } else if (line.startsWith('Index:') || line.startsWith('====')) {
          className = 'text-muted-foreground/70'
        }
        return (
          <div key={i} className={className}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}
