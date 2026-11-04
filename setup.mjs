#!/usr/bin/env node
// Renames this copy of the plugin to your own word, and can point your agent's instructions file at it.
// Usage: node setup.mjs [<word>] [--pointer <file>]... [--dry-run] [--yes]
import { readFileSync, writeFileSync, renameSync, readdirSync, existsSync, realpathSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const SKIP = new Set(['.git', '.claude', 'node_modules'])
const RESERVED = new Set(['add-dir', 'agents', 'approvals', 'bug', 'clear', 'compact', 'config', 'context', 'cost', 'diff',
  'doctor', 'exit', 'export', 'feedback', 'help', 'hooks', 'hooks-trust', 'ide', 'init', 'login', 'logout', 'marketplace',
  'mcp', 'memory', 'mention', 'model', 'new', 'permissions', 'plugin', 'plugins', 'quit', 'reload-plugins', 'resume',
  'review', 'rewind', 'settings', 'skills', 'status', 'statusline', 'theme', 'todos', 'undo', 'usage', 'vim'])
const START = '<!-- agent-complaints-pointer -->'
const END = '<!-- /agent-complaints-pointer -->'

export const validWord = (w) => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(w ?? '') && !RESERVED.has(w)
const title = (w) => w[0].toUpperCase() + w.slice(1)
const envName = (w) => `${w.toUpperCase().replace(/-/g, '_')}_DIR`
const whole = (w, flags = 'g') => new RegExp(`(?<![\\w-])${w}(?![\\w-])`, flags)
const manifest = (root) => JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'))
export const currentName = (root = ROOT) => manifest(root).name
// The GitHub `owner/repo` slug keeps its name, so links still reach the upstream repo.
const repoSlug = (root) => /github\.com\/([^/\s]+\/[^/\s.]+)/.exec(manifest(root).repository ?? '')?.[1] ?? '\0'

export function renameText(text, from, to, keep = '\0') {
  return text.split(keep).map((part) => part
    .replace(whole(from), to)
    .replace(whole(title(from)), title(to))
    .replace(whole(envName(from)), envName(to))).join(keep)
}

function textFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return []
    const p = join(dir, e.name)
    return e.isDirectory() ? textFiles(p) : [p]
  })
}

export function planRename(root, to) {
  const from = currentName(root)
  const keep = repoSlug(root)
  const edits = textFiles(root).map((path) => {
    const before = readFileSync(path, 'utf8')
    return { path, before, after: renameText(before, from, to, keep) }
  }).filter((e) => e.after !== e.before)
  const clashes = textFiles(root).filter((p) => readFileSync(p, 'utf8').split(keep).some((s) => whole(to, 'i').test(s)))
  return { from, edits, clashes }
}

export function pointerBlock(word) {
  return [
    START,
    `Complaints about this agent setup: \`/${word} <text>\` (Codex: \`$${word} <text>\`) files one without the session seeing it.`,
    `They are saved in \`~/.local/state/${word}/\` (or \`$${envName(word)}\`); a bare \`/${word}\` works through them.`,
    END,
  ].join('\n')
}

export function withPointer(text, word) {
  const block = pointerBlock(word)
  const at = text.indexOf(START)
  const stop = text.indexOf(END, at)
  if (at !== -1 && stop !== -1) return text.slice(0, at) + block + text.slice(stop + END.length)
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}${block}\n`
}

function rename(root, to, dry) {
  const { from, edits, clashes } = planRename(root, to)
  if (from === to) return console.log(`Already named ${to}.`), true
  if (clashes.length) return console.error(`"${to}" already appears in ${clashes.map((p) => relative(root, p)).join(', ')}. Pick another word.`), false
  for (const e of edits) console.log(`${dry ? 'would rewrite' : 'rewrote'} ${relative(root, e.path)}`)
  console.log(`${dry ? 'would move' : 'moved'} skills/${from} -> skills/${to}`)
  if (dry) return true
  for (const e of edits) writeFileSync(e.path, e.after)
  renameSync(join(root, 'skills', from), join(root, 'skills', to))
  console.log(`\nInstall from this folder: claude plugin marketplace add "${root}" && claude plugin install ${to}@${to}`)
  return true
}

async function confirm(question, yes) {
  if (yes) return true
  if (!process.stdin.isTTY) return console.log('Not asked (no terminal). Rerun with --yes to write it.'), false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try { return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim()) } finally { rl.close() }
}

async function addPointer(file, word, { dry, yes }) {
  const before = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const after = withPointer(before, word)
  if (after === before) return console.log(`${file} already points at /${word}.`)
  console.log(`\n${before.includes(START) ? 'Replace the pointer in' : 'Add to'} ${file}:\n\n${pointerBlock(word)}\n`)
  if (dry) return
  if (await confirm(`Write it to ${file}?`, yes)) { writeFileSync(file, after); console.log(`Wrote ${file}.`) }
}

export function parseArgs(argv) {
  const opts = { word: null, pointers: [], dry: false, yes: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') opts.dry = true
    else if (a === '--yes') opts.yes = true
    else if (a === '--pointer') opts.pointers.push(argv[++i])
    else opts.word = a
  }
  return opts
}

const defaultPointers = () => [join(homedir(), '.claude/CLAUDE.md'), join(homedir(), '.codex/AGENTS.md')].filter(existsSync)

export async function main(argv, root = ROOT) {
  const opts = parseArgs(argv)
  if (opts.word !== null && !validWord(opts.word)) {
    console.error('Usage: node setup.mjs [<word>] [--pointer <file>]... [--dry-run] [--yes]\n<word> is lowercase kebab-case and not a built-in command name.')
    return 1
  }
  if (opts.word && !rename(root, opts.word, opts.dry)) return 1
  const word = opts.dry && opts.word ? opts.word : currentName(root)
  const files = opts.pointers.length ? opts.pointers : opts.yes ? [] : defaultPointers()
  for (const f of files) await addPointer(f, word, opts)
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = await main(process.argv.slice(2))
