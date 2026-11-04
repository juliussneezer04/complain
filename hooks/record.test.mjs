import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promptText, queueDir, toolOf, lastActivity, record, captureVerdict } from './record.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const temps = []
const mk = () => { const d = mkdtempSync(join(tmpdir(), 'complain-')); temps.push(d); return d }
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }) })

const turn = (content, extra = {}) => JSON.stringify({ type: 'assistant', message: { content }, ...extra })

test('only /complain with text is a complaint; bare /complain is the pass', () => {
  assert.equal(promptText('/complain you used an em dash again'), 'you used an em dash again')
  assert.equal(promptText('/complain:complain namespaced form'), 'namespaced form')
  assert.equal(promptText('$complain codex mention'), 'codex mention')
  assert.equal(promptText('$complain'), null)
  assert.equal(promptText('  /complain\nmulti\nline  '), 'multi\nline')
  assert.equal(promptText('/complain'), null)
  assert.equal(promptText('/complain:complain'), null)
  assert.equal(promptText('/complain   '), null)
  assert.equal(promptText('/complains are fun'), null)
  assert.equal(promptText('/complain:other text'), null)
  assert.equal(promptText('please /complain about x'), null)
})

test('the folder defaults under home and honors COMPLAIN_DIR, with ~ expanded', () => {
  assert.equal(queueDir({}), join(homedir(), '.local/state/complain'))
  assert.equal(queueDir({ COMPLAIN_DIR: '/x/y' }), '/x/y')
  assert.equal(queueDir({ COMPLAIN_DIR: '~/notes/complaints' }), join(homedir(), 'notes/complaints'))
})

test('the calling tool is read from the hook input and env', () => {
  assert.equal(toolOf({ hook_event_name: 'UserPromptSubmit', session_id: 's' }, {}), 'claude-code')
  assert.equal(toolOf({ hook_event_name: 'UserPromptSubmit', turn_id: 't', model: 'm' }, {}), 'codex')
  assert.equal(toolOf({ hook_event_name: 'beforeSubmitPrompt', cursor_version: '1' }, {}), 'cursor')
  assert.equal(toolOf({ hookEventName: 'UserPromptSubmit' }, {}), 'grok')
  assert.equal(toolOf({ hook_event_name: 'UserPromptSubmit' }, { GROK_HOOK_EVENT: 'UserPromptSubmit' }), 'grok')
})

test('lastActivity keeps the main thread calls and reply, and hides secrets', () => {
  const dir = mk()
  const t = join(dir, 't.jsonl')
  writeFileSync(t, [
    turn([{ type: 'tool_use', name: 'Read', input: { file_path: '/a.md' } }]),
    turn([{ type: 'tool_use', name: 'Bash', input: { command: 'echo STRIPE_SECRET_KEY=sk_live_abcdefghijkl' } }]),
    turn([{ type: 'tool_use', name: 'Grep', input: { pattern: 'side' } }], { isSidechain: true }),
    turn([{ type: 'text', text: 'Done.' }]),
    'not json',
  ].join('\n'))
  const a = lastActivity(t)
  assert.deepEqual(a.calls, ['Read: /a.md', 'Bash: echo STRIPE_SECRET_KEY=<secret>'])
  assert.equal(a.reply, 'Done.')
  assert.deepEqual(lastActivity(join(dir, 'missing.jsonl')), { calls: [], reply: '' })
})

test('each complaint takes the next number of its day and blocks the prompt', () => {
  const dir = mk()
  const now = new Date(2026, 9, 30, 18, 0)
  const h = { prompt: '/complain the agent pushed without asking', session_id: 's1', transcript_path: '/none', cwd: '' }
  const first = record(h, { dir, now })
  assert.equal(first.id, '2026-10-30-1')
  const body = readFileSync(first.path, 'utf8')
  assert.match(body, /^---\nid: 2026-10-30-1\nstatus: open\ntool: claude-code\n/)
  assert.match(body, /\nat: 2026-10-30T18:00:00[+-]\d\d:\d\d\n/)
  assert.match(body, /\nthe agent pushed without asking\n/)
  const v = captureVerdict(h, { dir, now })
  assert.equal(v.decision, 'block')
  assert.match(v.reason, /Complaint 2026-10-30-2 recorded/)
  assert.equal(captureVerdict({ prompt: '/complain' }, { dir, now }), null)
  assert.equal(readdirSync(dir).length, 2)
})

test('the hook command writes the file the block message names', () => {
  const dir = mk()
  const r = spawnSync(process.execPath, [join(here, 'capture.mjs')], {
    input: JSON.stringify({ prompt: `/complain token ${'AKIA' + 'ABCDEFGHIJKLMNOP'} leaked`, cwd: '' }),
    env: { ...process.env, COMPLAIN_DIR: dir },
    encoding: 'utf8',
  })
  assert.equal(r.status, 0)
  const out = JSON.parse(r.stdout)
  assert.equal(out.decision, 'block')
  const [file] = readdirSync(dir)
  assert.match(out.reason, new RegExp(file.replace('.', '\\.')))
  assert.match(readFileSync(join(dir, file), 'utf8'), /\ntoken <secret> leaked\n/)
})

test('any other prompt passes with no output', () => {
  const dir = mk()
  const r = spawnSync(process.execPath, [join(here, 'capture.mjs')], {
    input: JSON.stringify({ prompt: 'fix the build', cwd: '' }),
    env: { ...process.env, COMPLAIN_DIR: dir },
    encoding: 'utf8',
  })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  assert.deepEqual(readdirSync(dir), [])
})

const root = join(here, '..')
const hookCommand = (file, event) => {
  const { hooks } = JSON.parse(readFileSync(join(here, file), 'utf8'))
  const entry = hooks[event][0]
  return entry.command ?? entry.hooks[0].command
}
const runHook = (command, input, env = {}) => spawnSync('sh', ['-c', command], {
  cwd: root,
  input: JSON.stringify(input),
  env: { ...process.env, CLAUDE_PLUGIN_ROOT: root, ...env },
  encoding: 'utf8',
})
const onlyFile = (dir) => readFileSync(join(dir, readdirSync(dir)[0]), 'utf8')

test('Codex: the shared hook blocks `$complain <text>` in its own format', () => {
  const dir = mk()
  const r = runHook(hookCommand('hooks.json', 'UserPromptSubmit'), {
    hook_event_name: 'UserPromptSubmit', session_id: 'x1', turn_id: 't1', model: 'm', cwd: '', transcript_path: null, prompt: '$complain it ignored AGENTS.md',
  }, { COMPLAIN_DIR: dir })
  const out = JSON.parse(r.stdout)
  assert.equal(out.decision, 'block')
  assert.match(out.reason, /bare \$complain/)
  assert.match(onlyFile(dir), /\ntool: codex\n[\s\S]*\nit ignored AGENTS\.md\n[\s\S]*- none found/)
})

test('Cursor: its hook file blocks with continue false and never reads the transcript', () => {
  const dir = mk()
  const t = join(dir, 'not-claude.jsonl')
  writeFileSync(t, turn([{ type: 'tool_use', name: 'Read', input: { file_path: '/a.md' } }]))
  const r = runHook(hookCommand('cursor-hooks.json', 'beforeSubmitPrompt'), {
    hook_event_name: 'beforeSubmitPrompt', conversation_id: 'c1', generation_id: 'g1', cursor_version: '2.0', workspace_roots: [], transcript_path: t, prompt: '/complain it skipped the rules',
  }, { COMPLAIN_DIR: join(dir, 'q') })
  const out = JSON.parse(r.stdout)
  assert.equal(out.continue, false)
  assert.match(out.user_message, /Complaint .* recorded/)
  const body = onlyFile(join(dir, 'q'))
  assert.match(body, /\ntool: cursor\n[\s\S]*\nsession: "c1"\n/)
  assert.doesNotMatch(body, /Read: \/a\.md/)
})

test('Grok Build: prompt hooks cannot block, so the hook stays silent and writes nothing', () => {
  const dir = mk()
  const r = runHook(hookCommand('hooks.json', 'UserPromptSubmit'), {
    hookEventName: 'UserPromptSubmit', sessionId: 'g1', cwd: '', prompt: '/complain x',
  }, { COMPLAIN_DIR: dir, GROK_HOOK_EVENT: 'UserPromptSubmit' })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  assert.deepEqual(readdirSync(dir), [])
})

test('the rename tip shows on the first capture only', () => {
  const dir = mk()
  const h = { prompt: '/complain first one', session_id: 's', cwd: '' }
  assert.match(captureVerdict(h, { dir, env: {} }).reason, /Tip: .*node setup\.mjs <word>/)
  assert.doesNotMatch(captureVerdict(h, { dir, env: {} }).reason, /Tip:/)
})
