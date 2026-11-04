import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validWord, renameText, withPointer, pointerBlock, currentName, parseArgs } from './setup.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const temps = []
const mk = () => { const d = mkdtempSync(join(tmpdir(), 'setup-')); temps.push(d); return d }
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }) })

// Built at run time so neither word appears in the repo, which the clash check would refuse.
const first = ['xy', 'zzy'].join('')
const second = ['plu', 'gh'].join('')

const copy = () => {
  const dir = join(mk(), 'repo')
  cpSync(here, dir, { recursive: true, filter: (src) => !/[/\\](\.git|\.claude|node_modules)([/\\]|$)/.test(src) })
  return dir
}
const setup = (dir, ...args) => spawnSync(process.execPath, [join(dir, 'setup.mjs'), ...args], { encoding: 'utf8' })
const allText = (dir) => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && !/[/\\]\.git([/\\]|$)/.test(e.parentPath))
  .map((e) => readFileSync(join(e.parentPath, e.name), 'utf8')).join('\n')

test('a word must be kebab-case and not a built-in command', () => {
  for (const w of ['aa', 'b-c', 'a1']) assert.equal(validWord(w), true, w)
  for (const w of ['Aa', '1x', 'a--b', 'a_b', '', undefined, 'help', 'plugins', 'skills']) assert.equal(validWord(w), false, String(w))
})

test('renameText swaps the word in every form, and leaves longer words and the repo slug alone', () => {
  const text = '/aa aa:aa $aa Aa AA_DIR state/aa/ aas aa-x github.com/o/aa o/aa'
  assert.equal(renameText(text, 'aa', 'bb-c', 'o/aa'), '/bb-c bb-c:bb-c $bb-c Bb-c BB_C_DIR state/bb-c/ aas aa-x github.com/o/aa o/aa')
})

test('the pointer is 2 lines between markers, and a second write replaces it', () => {
  const block = pointerBlock('aa')
  assert.equal(block.split('\n').length, 4)
  assert.match(block, /`\/aa <text>`[\s\S]*~\/\.local\/state\/aa\/[\s\S]*\$AA_DIR/)
  const once = withPointer('# Mine\n', 'aa')
  const twice = withPointer(once, 'bb')
  assert.equal(twice.match(/<!-- agent-complaints-pointer -->/g).length, 1)
  assert.match(twice, /^# Mine\n\n<!-- agent-complaints-pointer -->\n.*\/bb /)
  assert.equal(withPointer(twice, 'bb'), twice)
})

test('parseArgs reads the word and flags', () => {
  assert.deepEqual(parseArgs(['aa', '--pointer', 'f', '--dry-run', '--yes']), { word: 'aa', pointers: ['f'], dry: true, yes: true })
})

test('a dry run changes nothing', () => {
  const dir = copy()
  const before = allText(dir)
  const r = setup(dir, first, '--dry-run', '--yes')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /would rewrite \.claude-plugin\/plugin\.json/)
  assert.equal(allText(dir), before)
})

test('a word already in the text is refused', () => {
  const r = setup(copy(), 'agent', '--yes')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /already appears/)
})

test('renaming twice updates every file and the hook tests pass for each word', () => {
  const dir = copy()
  const from = currentName(dir)
  const pointer = join(dir, '..', 'AGENTS.md')
  writeFileSync(pointer, '# My rules\n')
  for (const word of [first, second]) {
    const r = setup(dir, word, '--pointer', pointer, '--yes')
    assert.equal(r.status, 0, r.stderr)
    assert.equal(currentName(dir), word)
    assert.ok(existsSync(join(dir, 'skills', word, 'SKILL.md')))
    const text = allText(dir).replaceAll('juliussneezer04/' + from, '')
    assert.doesNotMatch(text, new RegExp(`(?<![\\w-])${from}(?![\\w-])`, 'i'))
    assert.match(readFileSync(join(dir, 'skills', word, 'SKILL.md'), 'utf8'), new RegExp(`^---\\nname: ${word}\\n`))
    const t = spawnSync(process.execPath, ['--test', 'hooks/'], { cwd: dir, encoding: 'utf8' })
    assert.equal(t.status, 0, t.stdout)
  }
  const rules = readFileSync(pointer, 'utf8')
  assert.equal(rules.match(/<!-- agent-complaints-pointer -->/g).length, 1)
  assert.match(rules, new RegExp(`/${second} <text>`))
  assert.doesNotMatch(rules, new RegExp(first))
  assert.match(setup(dir, second, '--yes').stdout, /Already named/)
})
