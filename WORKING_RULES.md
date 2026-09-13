# Working rules (for any Claude session on this project)

Two standing rules the user set. Follow both.

## 1 · Token-efficient working

Default: **search narrowly → read minimally → edit minimally → verify narrowly →
report briefly.** Correctness first, then minimal token/context use.

- Concise replies; don't explain obvious steps or repeat the request/code/errors/
  prior conclusions.
- Inspect only files needed; grep for symbols/filenames/routes before opening large
  files; read only relevant portions. Reuse info already gathered; don't reread
  unchanged files.
- Enough info to change safely → implement. Simple task → just do it + brief
  report. Complex task → 3–5 bullet plan, then execute.
- Targeted edits over full rewrites. Don't refactor/rename/reformat unrelated code
  or make "nice to have" changes. Preserve existing architecture/conventions/deps;
  no new deps if the current stack suffices.
- Run only the most relevant checks first; filter huge command output.
- Debug the most likely hypothesis with targeted checks.
- Don't dump large code blocks after edits — reference filenames + summarize.
- Don't generate docs/comments/tests/examples unless requested or truly needed
  (exception: rule 2 below).
- Ask only when missing info blocks safe implementation; else assume and proceed.
- Final report = What changed / Files changed / Tests done / Unresolved.

## 2 · Always update /ai after working

After any work, update `/ai` **before finishing**: add a CHANGELOG entry, refresh
STATUS.md (last-updated + current state), tick TASKS.md, and update
API/ARCHITECTURE/OVERVIEW/PIPELINE if endpoints, modules, or capabilities changed.
This rule overrides "don't generate docs" above.
