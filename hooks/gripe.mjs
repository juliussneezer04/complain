// `/gripe <what went wrong>` is caught here: the gripe is written to the queue with what the session was
// doing, and the prompt never reaches the session. A bare `/gripe` runs the skill's pass over the queue.
import { mkdirSync, writeFileSync, readdirSync, openSync, readSync, fstatSync, closeSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { redact } from './redact.mjs'

const TAIL_BYTES = 1024 * 1024
const CALLS = 8
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}...` : t }

// A value set in settings.json `env` is not shell-expanded, so `~/` is expanded here.
export function gripeDir(env = process.env) {
  const set = env.GRIPE_DIR
  if (!set) return join(homedir(), '.local/state/gripe')
  return set.startsWith('~/') ? join(homedir(), set.slice(2)) : set
}

// Codex mentions skills with `$`, and plugin skills can be typed with their namespace.
export function gripeText(prompt) {
  const m = /^\s*[/$]gripe(?::gripe)?(?:\s+([\s\S]*\S))?\s*$/.exec(String(prompt ?? ''))
  return m && m[1] ? m[1].trim() : null
}

export function toolOf(h, env = process.env) {
  if (env.GROK_HOOK_EVENT || h.hookEventName) return 'grok'
  if (h.hook_event_name === 'beforeSubmitPrompt' || h.cursor_version) return 'cursor'
  if (h.turn_id) return 'codex'
  return 'claude-code'
}

function callSummary({ name, input = {} }) {
  const arg = input.command ?? input.file_path ?? input.pattern ?? input.skill ?? input.description ?? input.url
  return `${name}: ${clip(arg ?? JSON.stringify(input), 200)}`
}

// The main thread's last tool calls and last reply, from the tail of a Claude Code transcript.
export function lastActivity(path) {
  let text = ''
  try {
    const fd = openSync(path, 'r')
    try {
      const size = fstatSync(fd).size
      const start = Math.max(0, size - TAIL_BYTES)
      const buf = Buffer.alloc(size - start)
      text = buf.toString('utf8', 0, readSync(fd, buf, 0, buf.length, start))
    } finally { closeSync(fd) }
  } catch { return { calls: [], reply: '' } }
  const calls = []
  let reply = ''
  for (const line of text.split('\n')) {
    let rec
    try { rec = JSON.parse(line) } catch { continue }
    if (rec?.type !== 'assistant' || rec.isSidechain) continue
    for (const c of rec.message?.content || []) {
      if (c.type === 'tool_use') calls.push(redact(callSummary(c)))
      else if (c.type === 'text' && c.text.trim()) reply = c.text
    }
  }
  return { calls: calls.slice(-CALLS), reply: redact(clip(reply, 800)) }
}

function branchOf(cwd) {
  try { return execFileSync('git', ['-C', cwd, 'branch', '--show-current'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' }
}

const pad = (n) => String(n).padStart(2, '0')
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localIso = (d) => {
  const off = -d.getTimezoneOffset()
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
}

function sessionOf(h, tool) {
  const cwd = h.cwd ?? h.workspace_roots?.[0] ?? ''
  return {
    tool,
    session: h.session_id ?? h.conversation_id,
    transcript: h.transcript_path,
    cwd,
    branch: cwd ? branchOf(cwd) : '',
    activity: tool === 'claude-code' ? lastActivity(h.transcript_path) : { calls: [], reply: '' },
  }
}

function gripeFile({ id, at, text, s }) {
  const yaml = (v) => JSON.stringify(String(v ?? ''))
  return [
    '---',
    `id: ${id}`,
    'status: open',
    `tool: ${s.tool}`,
    `at: ${at}`,
    `session: ${yaml(s.session)}`,
    `transcript: ${yaml(s.transcript)}`,
    `cwd: ${yaml(s.cwd)}`,
    `branch: ${yaml(s.branch)}`,
    '---',
    '',
    redact(text),
    '',
    '## Last tool calls (oldest first)',
    '',
    ...(s.activity.calls.length ? s.activity.calls.map((c) => `- ${c}`) : ['- none found']),
    '',
    '## Last reply (excerpt)',
    '',
    s.activity.reply ? `> ${s.activity.reply}` : '> none found',
    '',
  ].join('\n')
}

// Exclusive create, so two sessions never take the same number.
export function recordGripe(h, { dir = gripeDir(), now = new Date(), tool = toolOf(h) } = {}) {
  const text = gripeText(h?.prompt)
  if (!text) return null
  mkdirSync(dir, { recursive: true })
  const date = localDate(now)
  const s = sessionOf(h, tool)
  for (let n = readdirSync(dir).filter((f) => f.startsWith(`${date}-`)).length + 1; ; n++) {
    const id = `${date}-${n}`
    const path = join(dir, `${id}.md`)
    try { writeFileSync(path, gripeFile({ id, at: localIso(now), text, s }), { flag: 'wx' }); return { id, path } } catch (e) { if (e.code !== 'EEXIST') throw e }
  }
}

// Grok Build cannot block a prompt, so the session sees the gripe and the skill records it.
export function captureVerdict(h, { env = process.env, ...opts } = {}) {
  const tool = toolOf(h, env)
  if (tool === 'grok') return null
  const got = recordGripe(h, { ...opts, tool })
  if (!got) return null
  const shown = got.path.startsWith(homedir()) ? `~${got.path.slice(homedir().length)}` : got.path
  const pass = tool === 'codex' ? '$gripe' : '/gripe'
  const reason = `Gripe ${got.id} recorded: ${shown}. This session did not see it; tell it too if it should change course now. Run a bare ${pass} later to work the queue.`
  return tool === 'cursor' ? { continue: false, user_message: reason } : { decision: 'block', reason }
}
