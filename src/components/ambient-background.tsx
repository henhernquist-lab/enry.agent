// Pure CSS, no JS/hooks — zero client bundle cost. Mounted once in the root
// layout so it shows behind every route, including /login. Sits fixed at
// z-index -1: paints above <html>'s own bg-background but below every page's
// (now-transparent) root container, per the page-level `bg-transparent`
// convention those roots use instead of an opaque bg-surface-base.
export function AmbientBackground() {
  return (
    <div aria-hidden="true" className="ambient-background pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="ambient-blob ambient-blob-1" />
      <div className="ambient-blob ambient-blob-2" />
      <div className="ambient-blob ambient-blob-3" />
      <div className="ambient-grain" />
    </div>
  )
}
