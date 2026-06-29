export default function AdminPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-base text-center text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-surface-elevated p-10 shadow-2xl shadow-black/20">
        <h1 className="text-4xl font-semibold">Admin</h1>
        <p className="mt-4 text-lg text-slate-300">
          The admin panel is active. This page is served from <code>/admin</code>.
        </p>
      </div>
    </main>
  )
}
