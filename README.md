# gripe

Gripe about your Claude Code setup the moment it fails, without derailing the session. Fix the root
cause later, in one pass.

- **`/gripe <what went wrong>`**: a hook writes the gripe to a local folder, with what the session was
  doing at that moment, and blocks the prompt. The running session never sees it and carries on.
- **`/gripe`** (bare): the skill works the queue. It reads open gripes and your past corrections,
  finds the root cause in your setup, and proposes the most deterministic fix: a hook beats a script,
  a script beats a skill, a skill beats a line in `CLAUDE.md`. Nothing lands until you approve it.
  Each gripe is then marked `fixed` or `rejected`.

## Install

```sh
claude plugin marketplace add juliussneezer04/gripe
claude plugin install gripe@gripe
```

Start a new session (or run `/reload-plugins`) so the hook loads. Needs `node` on your `PATH`.

If `/gripe` clashes with another command you have, type `/gripe:gripe` instead. The hook catches
both forms.

## Where gripes are stored

`~/.local/state/gripe/`, one Markdown file per gripe. Set `GRIPE_DIR` to use another folder; a
leading `~/` is expanded, so it works from the `env` block of `settings.json`:

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
| `at` | When the gripe was typed, with the time zone offset. |
| `session`, `transcript` | The Claude Code session id and its transcript file. |
| `cwd`, `branch` | Where the session was working. `branch` is empty outside git. |
| `fix` | Added by the pass when `status: fixed`: the commit or file that fixed it. |
| `reason` | Added by the pass when `status: rejected`: why. |

The body is your words, then up to 8 of the main thread's last tool calls and the last reply, taken
from the tail of the transcript. Subagent calls are skipped. The pass may also keep copies of retired
memories in `retired-memories/` inside the folder.

## Turn it off

```
/plugin disable gripe@gripe
```

That turns off the hook and the skill together. `/plugin uninstall gripe@gripe` removes the plugin.
Your gripe files stay where they are.

## Blast radius

- **What it blocks:** only a prompt that starts with `/gripe` or `/gripe:gripe` followed by text.
  Bare `/gripe`, `/gripes`, and `/gripe` anywhere but the start pass through. On every other prompt
  it exits after one regex test, so the cost is starting `node`.
- **What it writes:** one plain-text file per gripe in the folder above. It reads the tail of the
  session transcript and runs `git branch --show-current` in the session's folder. Nothing else.
- **Secrets:** values that look like keys, tokens, JWTs, private key blocks and `*_KEY=` /
  `*_TOKEN=` assignments become `<secret>` before anything is written. This is pattern-based, so a
  secret in an unusual shape can still reach the file. Do not paste credentials into a gripe.
- **When it fails:** if it cannot write the file, it lets the prompt through and prints the error.
  The skill then sees `/gripe <text>` and records the gripe by hand, so a gripe is never lost
  silently.
- **The pass:** bare `/gripe` proposes edits to your hooks, skills, `CLAUDE.md` and settings. It
  applies only what you approve, item by item, and never pushes or opens a PR without your yes.

## Development

```sh
node --test
claude plugin validate --strict .
```

## License

MIT
