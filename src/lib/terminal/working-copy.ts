import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { supabase } from '../supabase'
import { confinePath } from './snapshot'

const SESSION_WORKDIR_ROOT = path.join(os.tmpdir(), 'terminal-sessions')

// Live Terminal write mode — durable working-copy storage.
//
// The tarball snapshot on disk is per-serverless-instance scratch space; it
// does not survive between Vercel invocations. terminal_working_files is the
// actual source of truth for anything applied-but-not-committed. Every exec
// call re-materializes this session's rows onto the local snapshot copy
// before running a command, so `ls`/`cat`/`grep` still run as real binaries
// against a real directory — they just see a directory that's freshly
// rebuilt from Supabase on every request instead of assumed to persist.

export interface WorkingFile {
  file_path: string
  content: string
  base_sha: string
  is_new_file: boolean
}

export async function listWorkingFiles(sessionId: string): Promise<WorkingFile[]> {
  const { data, error } = await supabase
    .from('terminal_working_files')
    .select('file_path, content, base_sha, is_new_file')
    .eq('session_id', sessionId)
  if (error) {
    console.error('[terminal/working-copy] list failed:', error)
    return []
  }
  return data ?? []
}

export async function getWorkingFile(sessionId: string, filePath: string): Promise<WorkingFile | null> {
  const { data, error } = await supabase
    .from('terminal_working_files')
    .select('file_path, content, base_sha, is_new_file')
    .eq('session_id', sessionId)
    .eq('file_path', filePath)
    .maybeSingle()
  if (error) {
    console.error('[terminal/working-copy] get failed:', error)
    return null
  }
  return data
}

export async function upsertWorkingFile(
  userId: string,
  sessionId: string,
  filePath: string,
  content: string,
  baseSha: string,
  isNewFile: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.from('terminal_working_files').upsert(
    {
      user_id: userId,
      session_id: sessionId,
      file_path: filePath,
      content,
      base_sha: baseSha,
      is_new_file: isNewFile,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'session_id,file_path' },
  )
  if (error) {
    console.error('[terminal/working-copy] upsert failed:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true, error: null }
}

// Called after a successful commit — those files are no longer "applied but
// uncommitted", so they drop out of the working-copy table. The committed
// content is now the new baseline on GitHub; the next edit against any of
// these files starts fresh from there.
export async function clearWorkingFiles(sessionId: string, filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return
  const { error } = await supabase
    .from('terminal_working_files')
    .delete()
    .eq('session_id', sessionId)
    .in('file_path', filePaths)
  if (error) console.error('[terminal/working-copy] clear failed:', error)
}

// Returns the directory a session's commands should actually execute
// against. The pristine snapshot (keyed by repo+headSha) is shared and
// cached across sessions — writing a session's applied-but-uncommitted
// changes directly onto it would leak into any other session reading the
// same repo at the same head. So: if this session has no working files yet,
// commands run against the pristine snapshot directly (today's behavior,
// still correct — untouched files are identical either way). The first time
// a working file exists, this forks a session-scoped copy of the pristine
// snapshot and every subsequent call re-materializes onto that copy instead.
//
// Call this at the START of every exec, not just after apply — the
// directory is disposable per-instance scratch space, so it needs
// re-hydrating from Supabase on every request regardless of whether THIS
// request is the one that applied the change.
export async function resolveExecutionDir(sessionId: string, pristineSnapshotDir: string): Promise<string> {
  const files = await listWorkingFiles(sessionId)
  if (files.length === 0) return pristineSnapshotDir

  const sessionDir = path.join(SESSION_WORKDIR_ROOT, sessionId)
  try {
    await fs.access(sessionDir)
  } catch {
    await fs.mkdir(path.dirname(sessionDir), { recursive: true })
    await fs.cp(pristineSnapshotDir, sessionDir, { recursive: true })
  }

  for (const f of files) {
    const dest = confinePath(sessionDir, f.file_path)
    if (dest === null) continue // defense in depth; upsertWorkingFile paths are already validated at proposal time
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.writeFile(dest, f.content, 'utf-8')
  }

  return sessionDir
}
