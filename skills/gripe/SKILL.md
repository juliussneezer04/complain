---
name: gripe
description: "Turn gripes about your agent setup into fixes. `/gripe <what went wrong>` records a gripe without the session seeing it (the plugin's hook does that). Bare `/gripe` runs the pass: read the open gripes and your past corrections, find the root cause in your setup, propose the most deterministic fix (hook > script > skill > text rule), and land only what the user approves. Use when the user types `/gripe`, or asks to work their gripes or fix their agent setup from them."
---

# gripe

## 0. Which half you are in
- **`/gripe <text>`** is a gripe. This plugin's `UserPromptSubmit` hook records it and blocks the
  prompt, so a session normally never sees it. **If you are reading this with text after `/gripe`,
  the hook is not running or it failed:** write the gripe file yourself in the format below (next free
  number for today), reply with one line naming the file, and go back to your work. Do not run the
  pass.
- **Bare `/gripe`** runs the pass below.

The gripe folder is `$GRIPE_DIR` when set (a leading `~/` means home), else `~/.local/state/gripe/`.
A gripe file is `<YYYY-MM-DD>-<n>.md`, dated in this machine's time zone:

```
---
id: 2026-10-30-1
status: open            # open | fixed | rejected
at: <ISO time with offset>
session: "<session id>"
transcript: "<transcript path>"
cwd: "<folder>"
branch: "<git branch>"
---

<the user's words>

## Last tool calls (oldest first)
## Last reply (excerpt)
```

## The pass
The aim: turn every gripe, and every correction the user keeps repeating, into a durable change to
their setup, so the agent stops relearning the same thing. A gripe is the user telling you directly
that the setup failed; it outranks every inferred signal. Observe -> root cause -> propose -> ratify
-> land.

## 1. Observe
**Gripes first.** Read every `status: open` file in the gripe folder. When the excerpt is not enough,
open its transcript near the gripe's time. Group gripes about the same thing: each repeat is evidence
and moves the group up.

**Then closed gripes.** Read the `fixed` and `rejected` ones. They are the record of past passes: an
idea the user rejected does not come back unless a new gripe names it.

**Then corrections, in slices.** In Claude Code, auto-memory files live in
`~/.claude/projects/*/memory/*.md`; those with `metadata.type: feedback` (or an older `feedback_*.md`
name) are corrections the user gave. Read the ones touched since the last pass, not the whole store.
If the user's setup logs other signals (blocked actions, review findings, lesson files), ask once
where they are, and read slices of those too. Do not go hunting for them.

One pass is a batch, not the whole backlog: every open gripe, then corrections fill the rest.
**Done when** every open gripe is read and grouped, and the batch of corrections is chosen.

## 2. Root cause
**For a gripe, name the part of the setup that should have prevented it:** a missing or wrong hook,
script, skill, `CLAUDE.md` / `AGENTS.md` line, or settings permission. Or none: the setup said the
right thing and the model slipped. Then ask why the right text did not reach the model or did not win
(buried, contradicted, loaded too late, never loaded). "The model slipped" is a finding, not a
dismissal: it usually means a text rule that should become a hook.

**For a correction**, keep it only if it is recurring, not already encoded in the setup, not already
caught by a tool, true beyond one task, and statable concretely. A gripe skips the "recurring" test:
the user said it once, and that is enough.

- **Check current files before proposing.** A memory or gripe reflects what was true when written. If
  it names a file, flag or rule, confirm it still exists.
- **A hook that keeps firing is working**, not failing. It needs no companion rule.

Each correction leaves by ONE exit, and encoding it is the minority outcome:
- **Retire it (the default).** Delete the memory and let recurrence prove it mattered. Copy it to
  `retired-memories/` inside the gripe folder first. Never retire a silent or destructive failure
  mode: retire-to-test only works when a repeat would be noticed. Encode those.
- **Incorporate it** at its home on the ladder (step 3), then retire the memory.
- **Keep it as a memory**: a fact looked up on demand, not a standing correction.
- **Move it to a doc or skill**: a long procedure cannot sit in every session's context.

## 3. Propose
For each surviving item, pick the **most deterministic home that can carry the fix**, top first:
1. **Hook**: a gate that stops the wrong action, or does the right one, whatever the model thinks.
2. **Script or CLI command**: does the job right every time it is used.
3. **Skill**: a procedure loaded when the work touches it.
4. **Text rule**: a line in `CLAUDE.md`, `AGENTS.md`, or a rules file.

For each item, say in one line why each stronger home cannot carry it (a hook cannot see the decision;
the step needs judgment, so no script can do it). "It was easier to write a line" is not a reason.

Then pick **where it lives**. The test: would this change be true for someone else?
- **Only for this user**: their own `~/.claude/` (`CLAUDE.md`, `skills/`, `settings.json` hooks).
- **For everyone in one repo**: that repo's `CLAUDE.md` / `AGENTS.md` or `.claude/`.
- **For a shared library or plugin**: draft the change; the user opens the PR.

When the home is genuinely unclear, say so and let the user pick. Do not put it in two places.

Produce a **ranked list**: gripes first, then by how often the pattern recurs and how cleanly it
encodes. Each item carries the gripe ids or evidence, the root cause, the home and exact file, the
diff you would apply, and the ladder line. **Done when** every open gripe in the batch is either an
item on the list or marked for rejection with a reason.

## 4. Ratify
Show the ranked list with its diffs. The user approves per item ("yes to 1 and 3, skip 2, change 4 to
..."). Apply only what they approve, exactly as approved. Nothing lands without this yes.

## 5. Land
- Apply each approved change. A skill or `CLAUDE.md` change reaches the next session that loads it; a
  hook or `settings.json` change needs a new session. Say which. Running sessions keep the old rules.
- For a shared-library or other-repo item, prepare the branch and the diff, and stop. Push or open a
  PR only on the user's yes.
- **Close each gripe:** set `status: fixed` and add `fix: <commit or file>`, or `status: rejected` and
  add `reason: <why>`. Keep every gripe file; the closed ones are the record step 1 reads.

**Done when** every gripe in the batch is `fixed` or `rejected`, and the user knows which changes need
a new session.
