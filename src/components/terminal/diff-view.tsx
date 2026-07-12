// Colors a unified diff string - green additions, red deletions, muted hunk
// headers. The diff text is generated server-side (src/lib/terminal/diff.ts,
// the `diff` package), so this only classifies lines. The Index:, ===, and
// ---/+++ preamble lines that createTwoFilesPatch emits are dropped - the
// filename already lives in the card header above the diff, so repeating it is
// noise (git's own diff view hides them too).
export function DiffView({ diffText }: { diffText: string }) {
  const lines = diffText.split('\n').filter(
    (l) => !l.startsWith('Index:') && !l.startsWith('===') && !l.startsWith('--- ') && !l.startsWith('+++ '),
  )

  return (
    <pre className="mb-1 overflow-x-auto whitespace-pre break-words text-[12px] leading-relaxed">
      {lines.map((line, i) => {
        let className = 'text-foreground/60'
        if (line.startsWith('+')) className = 'text-primary'
        else if (line.startsWith('-')) className = 'text-red-400'
        else if (line.startsWith('@@')) className = 'text-accent'
        return (
          <div key={i} className={className}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}
