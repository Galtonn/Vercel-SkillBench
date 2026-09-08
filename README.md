# SkillBench

SkillBench evaluates whether an Agent Skill actually improves an AI agent's performance.

A `SKILL.md` can be well written and still be useless in practice, because the agent never realises it should load it. Those are two different failures with two different fixes, and a single success number hides both. So SkillBench measures three things separately:

```text
Discovery → Invocation → Effectiveness
```

### Discovery

Does the agent recognise that the skill is relevant to the task in front of it? The only thing it sees before deciding is the skill's `name` and `description`.

### Invocation

Does it actually load the instructions? SkillBench gives the model a real `use_skill` tool and records the call. Invocation is never inferred from the wording of the answer — if the tool was not called, the skill was not loaded.

### Effectiveness

Once the instructions are in context, do they improve task success? This is measured against a no-skill baseline on the same tasks.

## The four conditions

Every task runs independently under each selected condition. The task text, the tools, and the base system prompt are identical across conditions, so a difference in success is attributable to how the skill was delivered.

| Condition | What the model gets | Trigger rate |
| --- | --- | --- |
| **Baseline** | The task and read-only repository tools. No skill name, description, or instructions. | Not applicable |
| **Skill** | The skill's name and description, plus a `use_skill` tool it may call. | **Measured** |
| **Explicit Trigger** | The full instructions up front, with the prompt stating the skill applies to this task. | 100% by construction |
| **AGENTS.md** | The same instructions as persistent repository guidance, present for every task with no claim of relevance. | 100% by construction |

Only the Skill condition involves a decision, so it is the only one with a measured trigger rate and a run classification. Explicit Trigger and AGENTS.md are recorded at 100% because the instructions are always delivered; that is noted in the UI rather than presented as a measurement.

Explicit Trigger answers "if the agent definitely uses the skill, how good is the skill itself?" AGENTS.md is a controlled comparison of a different delivery strategy — it is not a reproduction of any particular coding agent's `AGENTS.md` handling.

## Run classifications

Each Skill-condition run is classified by crossing the benchmark's ground truth with what the model did:

| | Skill loaded | Skill not loaded |
| --- | --- | --- |
| **Skill relevant** | `invoked_pass` / `invoked_fail` | `missed_trigger_success` / **`missed_trigger_failure`** |
| **Skill not relevant** | `false_positive_pass` / `false_positive_fail` | `skill_not_needed` |

`missed_trigger_failure` is the interesting one: the skill would have helped, the agent never loaded it, and the task failed. That is a discovery problem, and no amount of editing the instruction body will fix it.

## Setup

Requires Node 20+.

```bash
npm install
```

Copy the environment template and set a long access code, an independent random
session secret, and the API key for each provider you want to test:

```bash
# .env.local
DEMO_ACCESS_CODE=your-long-recruiter-code
DEMO_SESSION_SECRET=generate-a-random-32-byte-secret
OPENAI_API_KEY=sk-...
V0_API_KEY=...                   # required only for v0
```

Optional:

```bash
SKILLBENCH_MODEL=gpt-4o-mini      # default: gpt-4o-mini
SKILLBENCH_DATA_DIR=./data/evaluations  # where results are written
```

Keys are read server-side only and are never sent to the browser. v0 evaluations
use the current v0 Platform API v2 at `https://v0.app/api/v2`. The picker exposes
`v0-mini`, `v0-pro`, `v0-max`, and `v0-max-fast`. Each isolated model conversation
creates a private v0 chat tagged with `source=skillbench` in the connected v0
account.

The v0 Platform API is an agent API, not a raw function-calling model endpoint.
SkillBench therefore supplies its read-only tools through a strict JSON request
protocol. A tool is counted only when v0 emits that exact request and SkillBench
executes it; wording in the final answer is never treated as invocation. This
keeps v0 evals executable and auditable, but their tool-trigger rates should not
be treated as directly interchangeable with native OpenAI function calling.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Recruiter demo deployment

The hosted build is a private, bounded portfolio demo rather than a public SaaS:

- A shared access code creates a signed, secure seven-day guest session.
- Every guest session sees and controls only its own evaluations.
- Production requires Neon Postgres; local development can still use JSON files.
- A single evaluation is capped at 12 agent executions, with 10 evaluations per
  guest and 50 total evaluations in a rolling 24-hour period.
- Hosted evaluation work runs after the `202 Accepted` response for up to five
  minutes. Progress and cancellation state are persisted in Neon.
- Local filesystem skill references are disabled in production. Recruiters can
  paste a `SKILL.md` or use a public GitHub reference.
- The site is marked `noindex` and sends restrictive browser security headers.

To deploy:

1. Import this repository into Vercel.
2. Add Neon from **Vercel → Storage** and connect it to the project. This injects
   `DATABASE_URL`; SkillBench creates its table and index on first use.
3. Add `DEMO_ACCESS_CODE`, `DEMO_SESSION_SECRET`, `OPENAI_API_KEY`, and optionally
   `V0_API_KEY` to the Production environment.
4. Set provider-side spend limits and alerts, then redeploy.
5. Visit `/access`, enter the code, and run the three-task **Live demo** preset.

Use a high-entropy access code. If it is ever shared beyond the intended
audience, rotate both demo secrets to invalidate existing sessions as well.

The manual schema is included at `db/schema.sql` for inspection, although normal
deployments do not need to run it separately.

## Running the built-in benchmark

The New Evaluation page (`/new`) has a **Live demo: analyze-bundle** preset. It fills in:

- **Skill** — `vercel-labs/dev3000/analyze-bundle`, fetched from GitHub at run time
- **Context** — `fixtures/bundle-bench`, a small Next.js app with real bundle-analyzer artifacts, mounted read-only
- **Tasks** — 3 curated tasks: 2 that the skill genuinely helps with, 1 that it does not
- **Conditions** — all four
- **Runs** — 1 per condition

A picker above the task list switches between two built-in skills:

- **analyze-bundle** — three sizes: **Live demo · 3**, **Standard · 5**, and **Full benchmark · 10**
- **web-design-guidelines** — seven tasks over `fixtures/ui-bench`, with planted accessibility and layout defects

Each analyze-bundle preset is a subset of the ten-task set rather than a rewrite. Every built-in set keeps at least one skill-relevant task and at least one non-relevant task, so trigger rate and false-positive rate are both measurable.

## Custom skills

Uncheck **Use built-in benchmark** to evaluate an arbitrary `SKILL.md`.

1. Load the skill (public GitHub reference, URL, or pasted markdown). Local paths
   remain available only during local development.
2. Point the evaluation at a fixture (`fixtures/bundle-bench` or `fixtures/ui-bench`) so the agent can read files.
3. Either **Generate benchmark from skill** or author tasks in the structured editor.
4. For every task, set whether the skill should help, the scoring method, and task-specific criteria or keywords. Optionally add a reference answer for the judge.
5. Review the **Benchmark quality** panel. Warnings (all tasks marked relevant, missing criteria, a single non-relevant task, no fixture) do not block a run, but they mean the numbers will not mean what they look like.

Generated tasks are drafts. They are never started until you review them. Each evaluation is labelled **Built-in**, **AI-generated**, or **User-authored** so a later reader knows how much to trust the ground truth.

Trigger rate is always `skill loaded on relevant skill-condition runs / relevant skill-condition runs`. Non-relevant tasks are the false-positive denominator. Relevance is the author-supplied `skillRelevant` flag, never inferred from prompt wording.

The non-relevant tasks are what make false-positive loading measurable. Without them you can only see missed triggers, not over-eager ones. Live demo and Standard have one each, so their false-positive rate can only read 0% or 100%; use the full benchmark when that number needs to be meaningful.

The benchmark is designed so the answers are not guessable from `package.json`. The two largest modules in the repository, `@aws-sdk/client-s3` (268 KB) and `lodash` (71 KB), are server-only and never reach the browser; two more are declared but unused. An agent that ranks dependencies by reputation gets the wrong answer, and an agent that reads the analyzer artifacts gets the right one.

With the default preset, one run is:

```text
3 tasks × 4 conditions × 1 run = 12 agent executions
+ up to 8 judge calls (1 of the 3 tasks is scored deterministically)
+ 1 analysis call
```

Agent executions take more than one model call each when the agent reads files. With all four conditions and 1 run each, budget roughly:

| Preset | Tasks | Agent executions | Judge calls | Analysis | Total requests |
| --- | --- | --- | --- | --- | --- |
| Live demo | 3 | 12 | 8 | 1 | ~45 |
| Standard | 5 | 20 | 16 | 1 | ~77 |
| Full benchmark | 10 | 40 | 32 | 1 | ~153 |

The **Before you run** panel on `/new` computes these from whatever you have selected, so they track task count, conditions, and runs as you change them.

## Scoring

Two modes, chosen per task:

- **`contains`** — deterministic substring matching, case-insensitive and whitespace-normalised. No fuzzy matching.
- **`llm_judge`** — a separate model call given the task, the task-specific criteria, an optional reference answer, and the candidate answer. The judge is not told which condition produced the answer, so it cannot favour one. A reference answer is orientation, not a verbatim match. Malformed verdicts are retried once with stricter instructions; a verdict that still fails to parse marks the run unscored rather than failed, because an unscorable run is not evidence either way.

## What the results show

Every sentence in the results UI is generated from the measured metrics. A difference under 5 percentage points is described as immaterial rather than as a win, and no copy claims an improvement the numbers do not show. Where a quantity could not be measured — no baseline, no scored runs — the UI shows a dash instead of a zero. Fewer than 10 scored runs on skill-relevant tasks produces a sample-size warning; a single non-relevant task is called out as an unstable false-positive rate. A tiny negative result is labelled **Underperformed in this small benchmark**, not **Harmful**.

The **Improve Skill** flow uses the actual failures to propose a revised `SKILL.md`. It diagnoses whether the data shows a discovery problem (rewrite the name, description, and trigger wording) or an instruction problem (rewrite the body), and the revision is validated as a parseable `SKILL.md` before being stored. It is never described as better until a re-evaluation measures it.

## Storage

Production results are stored in Neon Postgres as isolated JSONB records. Local
development and tests fall back to `data/evaluations/<id>.json` (or
`SKILLBENCH_DATA_DIR`). A completed evaluation is plain stored data with no
dependency on the model provider, and there is no fallback to synthetic results.

## Safety

The agent's view of the repository is a read-only sandbox over a single `fixtures/` directory, exposing exactly two tools: `list_files` and `read_file`. Paths are resolved through `realpath` and rejected if they leave the fixture root, so symlinks cannot escape. There is no write path and no shell, and model output is never executed.

## Tests

```bash
npm test
```

Covers `SKILL.md` parsing, the deterministic scorer, the `use_skill` tool loop, judge and findings parsing, run classification, aggregate and trigger metrics, storage round-tripping, the sandbox boundary, and the adapter into the UI view models. Model responses are scripted in tests only; production code always talks to a real provider.

## Limitations

- One agent and one skill per evaluation. OpenAI models use native function
  calling; v0 uses the explicit adapter described above. Each evaluation still
  runs one agent so its skill-delivery configurations remain directly comparable.
- Tasks are analysis and diagnosis, not autonomous code editing. The agent reads the repository and describes changes; it does not apply them, so there is no build or test validation.
- The `AGENTS.md` condition is a controlled delivery comparison, not a faithful reproduction of a specific agent harness.
- Task counts are small by design (3 tasks by default, 10 in the full analyze-bundle benchmark, 1 run each), so a single task moves the percentages substantially. Raise runs per condition, or switch to a larger preset, for a tighter estimate at proportional cost.
- The hosted demo intentionally caps an evaluation at 12 agent executions. Larger
  presets remain useful locally, or can be run by selecting fewer conditions.
- An AI-generated benchmark is a draft. The model that writes the tasks also writes the ground truth, so review relevance and criteria before treating the numbers as evidence.
