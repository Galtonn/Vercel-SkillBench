# bundle-bench

A small, controlled Next.js application used as the read-only repository for
SkillBench's built-in `analyze-bundle` benchmark.

It is deliberately **not** a runnable app. It exists so that an agent can be
asked realistic bundle-analysis questions and answer them from evidence:

- `app/`, `components/`, `lib/` — application sources with a realistic mix of
  server and client components.
- `.next/diagnostics/analyze/ndjson/` — Next.js bundle analyzer artifacts,
  already converted to NDJSON. These are the files the `analyze-bundle` skill
  teaches an agent to read.

The ground truth for each benchmark task is recoverable from these artifacts and
from the import graph in the sources. It is **not** recoverable by guessing which
npm packages sound large — `package.json` intentionally lists heavy dependencies
that never reach the browser.

SkillBench mounts this directory read-only. Agents get `list_files` and
`read_file`; there is no write path and no shell.
