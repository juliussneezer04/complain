# complain

Complain about your agent setup the moment it fails, without derailing the session. Fix the root cause
later, in one pass. Works in Claude Code, Codex, Cursor and Grok Build, with one shared complaints
folder.

Prefer another word than `/complain`? Clone this repo and run `node setup.mjs <word>` (see
[Use your own word](#use-your-own-word)).

- **`/complain <what went wrong>`** (`$complain` in Codex): a hook writes the complaint to a local
  folder, with what the session was doing at that moment, and blocks the prompt. The running session
  never sees it and carries on.
- **`/complain`** (bare): the skill works the queue. It reads open complaints and your past
  corrections, finds the root cause in your setup, and proposes the most deterministic fix: a hook
  beats a script, a script beats a skill, a skill beats a line in an instruction file. Nothing lands
  until you approve it. Each complaint is then marked `fixed` or `rejected`.

Every tool needs `node` on your `PATH`.

## Install

### Claude Code

```sh
claude plugin marketplace add juliussneezer04/complain
claude plugin install complain@complain
```

Start a new session (or run `/reload-plugins`). If `/complain` clashes with another command, type
`/complain:complain`; the hook catches both. For your own word, install from a renamed clone instead
([Use your own word](#use-your-own-word)).

### Codex

```sh
codex plugin marketplace add juliussneezer04/complain
```

Then install `complain` from `/plugins`, start a new session, and trust its hook in `/hooks` (Codex
keeps plugin hooks off until you review them). Type `$complain <text>`. For your own word, add a renamed
clone as the marketplace instead.

### Cursor

```sh
cursor-agent plugin marketplace add https://github.com/juliussneezer04/complain
```

Or in the editor: Customize, then Import from Repo with the same URL. To try a local copy, or a
renamed one, put it at `~/.cursor/plugins/local/complain` (or your word) and reload the window.

### Grok Build

Grok Build reads Claude Code plugins, so a Claude Code install also works there. Or add this repo in
`/marketplace` and install `complain` from `/plugins`. A renamed Claude Code install carries over too.

Grok Build's prompt hooks cannot block a prompt. There, `/complain <text>` reaches the session, and the
skill writes the complaint file itself, then goes back to work.

## Use your own word

```sh
git clone https://github.com/juliussneezer04/complain && cd complain
node setup.mjs <word> --dry-run   # list what would change
node setup.mjs <word>
claude plugin marketplace add "$PWD" && claude plugin install <word>@<word>
```

The script renames the command, the skill, the plugin, the env var (`<WORD>_DIR`) and the default
folder (`~/.local/state/<word>/`) in your clone, for all four tools. The word must be lowercase
kebab-case, not a built-in command, and not already used in the repo's text. Running it again with the
same word changes nothing.

Why a clone: a skill's command comes from its name, so a config file read by the hook could not rename
the skill. The cost is that your clone does not update from GitHub; to update, take a fresh clone and
run the script again.

At the end it offers to add a short pointer to your agent's instructions file, so later sessions know
the command and where complaints live. It shows the text and asks before writing; running it again
replaces the old pointer. It offers `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` when they exist.
Name any other file (a Cursor rule, a repo's `AGENTS.md`) with `--pointer <file>`, and add `--yes` to
skip the question. `node setup.mjs` with no word only adds the pointer.

## Where complaints are stored

`~/.local/state/complain/`, one Markdown file per complaint, shared by every tool. Set `COMPLAIN_DIR`
to use another folder; a leading `~/` is expanded, so it works from a settings `env` block:

```json
{ "env": { "COMPLAIN_DIR": "~/notes/complaints" } }
```

The hook and the skill both read `COMPLAIN_DIR`. Nothing is sent anywhere.

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
| `at` | When the complaint was typed, with the time zone offset. |
| `session`, `transcript` | The tool's session or conversation id, and its transcript file if it gave one. |
| `cwd`, `branch` | Where the session was working. `branch` is empty outside git. |
| `fix` | Added by the pass when `status: fixed`: the commit or file that fixed it. |
| `reason` | Added by the pass when `status: rejected`: why. |

The body is your words, then up to 8 of the main thread's last tool calls and the last reply. Only
Claude Code's transcript format is read; other tools get `none found` there. The pass may also keep
copies of retired memories in `retired-memories/` inside the folder.

## Turn it off

Disable or uninstall `complain` in the tool's plugin list (`claude plugin disable complain@complain`
in Claude Code, `/plugins` in Codex and Grok Build, the Customize panel in Cursor). That turns off the
hook and the skill together. Your complaint files stay where they are.

## Blast radius

- **What it blocks:** only a prompt that starts with `/complain`, `/complain:complain` or `$complain`
  followed by text. A bare `/complain`, `/complains`, and `/complain` anywhere but the start pass
  through. On every other prompt it exits after one regex test, so the cost is starting `node`. In
  Grok Build it never blocks.
- **What it writes:** one plain-text file per complaint in the folder above. It reads the tail of the
  Claude Code session transcript and runs `git branch --show-current` in the session's folder. The
  first capture's reply carries a one-line tip about renaming; later ones do not.
- **Setup script:** rewrites files only inside your clone. It writes your instructions file only after
  you say yes (or pass `--yes`), and only between its own markers.
- **Secrets:** values that look like keys, tokens, JWTs, private key blocks and `*_KEY=` /
  `*_TOKEN=` assignments become `<secret>` before anything is written. This is pattern-based, so a
  secret in an unusual shape can still reach the file. Do not paste credentials into a complaint.
- **When it fails:** if it cannot write the file, it lets the prompt through and prints the error.
  The skill then sees `/complain <text>` and records the complaint by hand, so a complaint is never
  lost silently.
- **The pass:** bare `/complain` proposes edits to your hooks, skills, instruction files and settings.
  It applies only what you approve, item by item, and never pushes or opens a PR without your yes.

## Development

```sh
node --test
claude plugin validate --strict .
```

## License

MIT
