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

Set your API key. The only required variable is:

```bash
# .env.local
OPENAI_API_KEY=sk-...
```

Optional:

```bash
SKILLBENCH_MODEL=gpt-4o-mini      # default: gpt-4o-mini
SKILLBENCH_DATA_DIR=./data/evaluations  # where results are written
```

The key is read server-side only and is never sent to the browser.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Running the built-in benchmark

The New Evaluation page (`/new`) has a **Live demo: analyze-bundle** preset. It fills in:

- **Skill** — `vercel-labs/dev3000/analyze-bundle`, fetched from GitHub at run time
- **Context** — `fixtures/bundle-bench`, a small Next.js app with real bundle-analyzer artifacts, mounted read-only
- **Tasks** — 3 curated tasks: 2 that the skill genuinely helps with, 1 that it does not
- **Conditions** — all four
- **Runs** — 1 per condition

A picker above the task list switches between three sizes: **Live demo · 3**, **Standard · 5**, and **Full benchmark · 10**. Each preset is a subset of the ten-task set rather than a rewrite, and the smaller ones nest inside the larger ones, so a task scores the same however you ran it. Every preset keeps at least one skill-relevant task, one task whose prompt never mentions bundles, and one non-relevant task, so all three sizes measure discovery, invocation, effectiveness, and false positives.

Editing the task list switches the form out of preset mode and treats your text as ad-hoc tasks.

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
- **`llm_judge`** — a separate model call given the task, the criteria, and the candidate answer. The judge is not told which condition produced the answer, so it cannot favour one. Malformed verdicts are retried once with stricter instructions; a verdict that still fails to parse marks the run unscored rather than failed, because an unscorable run is not evidence either way.

## What the results show

Every sentence in the results UI is generated from the measured metrics. A difference under 5 percentage points is described as immaterial rather than as a win, and no copy claims an improvement the numbers do not show. Where a quantity could not be measured — no baseline, no scored runs — the UI shows a dash instead of a zero.

The **Improve Skill** flow uses the actual failures to propose a revised `SKILL.md`. It diagnoses whether the data shows a discovery problem (rewrite the name, description, and trigger wording) or an instruction problem (rewrite the body), and the revision is validated as a parseable `SKILL.md` before being stored. It is never described as better until a re-evaluation measures it.

## Storage

Results are written to `data/evaluations/<id>.json`, one file per evaluation. A saved evaluation is plain data with no dependency on the model provider, so a completed run stays viewable and demoable even if the API is later unreachable. There is no fallback to synthetic results: if a live run fails, the error is shown.

## Safety

The agent's view of the repository is a read-only sandbox over a single `fixtures/` directory, exposing exactly two tools: `list_files` and `read_file`. Paths are resolved through `realpath` and rejected if they leave the fixture root, so symlinks cannot escape. There is no write path and no shell, and model output is never executed.

## Tests

```bash
npm test
```

Covers `SKILL.md` parsing, the deterministic scorer, the `use_skill` tool loop, judge and findings parsing, run classification, aggregate and trigger metrics, storage round-tripping, the sandbox boundary, and the adapter into the UI view models. Model responses are scripted in tests only; production code always talks to a real provider.

## Limitations

- One provider (OpenAI) and one skill per evaluation.
- Tasks are analysis and diagnosis, not autonomous code editing. The agent reads the repository and describes changes; it does not apply them, so there is no build or test validation.
- The `AGENTS.md` condition is a controlled delivery comparison, not a faithful reproduction of a specific agent harness.
- Task counts are small by design (5 tasks by default, 10 in the full benchmark, 1 run each), so a single task moves the percentages substantially. Raise runs per condition, or switch to the full benchmark, for a tighter estimate at proportional cost.
- Ad-hoc tasks typed into the form are all treated as skill-relevant and judged against generic criteria. Labelled non-relevant tasks, and therefore real false-positive measurement, require a benchmark.
