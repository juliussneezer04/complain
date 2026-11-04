# gripe

Gripe about your agent setup the moment it fails, without derailing the session. Fix the root cause
later, in one pass. Works in Claude Code, Codex, Cursor and Grok Build, with one shared gripe folder.

- **`/gripe <what went wrong>`** (`$gripe` in Codex): a hook writes the gripe to a local folder, with
  what the session was doing at that moment, and blocks the prompt. The running session never sees it
  and carries on.
- **`/gripe`** (bare): the skill works the queue. It reads open gripes and your past corrections,
  finds the root cause in your setup, and proposes the most deterministic fix: a hook beats a script,
  a script beats a skill, a skill beats a line in an instruction file. Nothing lands until you approve
  it. Each gripe is then marked `fixed` or `rejected`.

Every tool needs `node` on your `PATH`.

## Install

### Claude Code

```sh
claude plugin marketplace add juliussneezer04/gripe
claude plugin install gripe@gripe
```

Start a new session (or run `/reload-plugins`). If `/gripe` clashes with another command, type
`/gripe:gripe`; the hook catches both.

### Codex

```sh
codex plugin marketplace add juliussneezer04/gripe
```

Then install `gripe` from `/plugins`, start a new session, and trust its hook in `/hooks` (Codex keeps
plugin hooks off until you review them). Type `$gripe <text>`.

### Cursor

```sh
cursor-agent plugin marketplace add https://github.com/juliussneezer04/gripe
```

Or in the editor: Customize, then Import from Repo with the same URL. To try a local copy, clone it
to `~/.cursor/plugins/local/gripe` and reload the window.

### Grok Build

Grok Build reads Claude Code plugins, so a Claude Code install also works there. Or add this repo in
`/marketplace` and install `gripe` from `/plugins`.

Grok Build's prompt hooks cannot block a prompt. There, `/gripe <text>` reaches the session, and the
skill writes the gripe file itself, then goes back to work.

## Where gripes are stored

`~/.local/state/gripe/`, one Markdown file per gripe, shared by every tool. Set `GRIPE_DIR` to use
another folder; a leading `~/` is expanded, so it works from a settings `env` block:

```json
{ "env": { "GRIPE_DIR": "~/notes/gripes" } }
```

The hook and the skill both read `GRIPE_DIR`. Nothing is sent anywhere.

## File format

Other tools and agents can read this folder. The file name, the frontmatter keys and the `status`
values are the interface: they only grow, they do not get renamed.

The file is `<YYYY-MM-DD>-<n>.md`, dated in your machine's time zone. `n` counts up from 1 each day,
and the file is created exclusively, so two sessions never take the same number.

```markdown
---
id: 2026-10-30-1
status: open
tool: claude-code
at: 2026-10-30T18:02:51+08:00
session: "<session id>"
transcript: "<transcript path>"
cwd: "<folder>"
branch: "<git branch, or empty>"
---

the agent pushed without asking

## Last tool calls (oldest first)

- Bash: git push origin my-branch

## Last reply (excerpt)

> Pushed. Opening the PR now.
```

| Key | Meaning |
| --- | --- |
| `id` | The file name without `.md`. |
| `status` | `open` when written. The pass sets `fixed` or `rejected`. |
| `tool` | `claude-code`, `codex`, `cursor` or `grok`. |
| `at` | When the gripe was typed, with the time zone offset. |
| `session`, `transcript` | The tool's session or conversation id, and its transcript file if it gave one. |
| `cwd`, `branch` | Where the session was working. `branch` is empty outside git. |
| `fix` | Added by the pass when `status: fixed`: the commit or file that fixed it. |
| `reason` | Added by the pass when `status: rejected`: why. |

The body is your words, then up to 8 of the main thread's last tool calls and the last reply. Only
Claude Code's transcript format is read; other tools get `none found` there. The pass may also keep
copies of retired memories in `retired-memories/` inside the folder.

## Turn it off

Disable or uninstall `gripe` in the tool's plugin list (`claude plugin disable gripe@gripe` in Claude
Code, `/plugins` in Codex and Grok Build, the Customize panel in Cursor). That turns off the hook and
the skill together. Your gripe files stay where they are.

## Blast radius

- **What it blocks:** only a prompt that starts with `/gripe`, `/gripe:gripe` or `$gripe` followed by
  text. A bare `/gripe`, `/gripes`, and `/gripe` anywhere but the start pass through. On every other
  prompt it exits after one regex test, so the cost is starting `node`. In Grok Build it never blocks.
- **What it writes:** one plain-text file per gripe in the folder above. It reads the tail of the
  Claude Code session transcript and runs `git branch --show-current` in the session's folder.
  Nothing else.
- **Secrets:** values that look like keys, tokens, JWTs, private key blocks and `*_KEY=` /
  `*_TOKEN=` assignments become `<secret>` before anything is written. This is pattern-based, so a
  secret in an unusual shape can still reach the file. Do not paste credentials into a gripe.
- **When it fails:** if it cannot write the file, it lets the prompt through and prints the error.
  The skill then sees `/gripe <text>` and records the gripe by hand, so a gripe is never lost
  silently.
- **The pass:** bare `/gripe` proposes edits to your hooks, skills, instruction files and settings.
  It applies only what you approve, item by item, and never pushes or opens a PR without your yes.

## Development

```sh
node --test
claude plugin validate --strict .
```

## License

MIT
