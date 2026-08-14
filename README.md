# SkillBench

A prototype evaluation tool for AI Agent Skills. Looks like a Vercel developer product; all data is mocked.

This demo answers a single question: **does this `SKILL.md` actually make a coding agent better — and can the agent find it when it needs it?**

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo path

1. **Evaluations** (`/`) — recent skill evals. Open `analyze-bundle`.
2. **New Evaluation** (`/new`) — configure a run. **Run Evaluation** simulates progress, then opens results.
3. **Results** (`/evaluations/analyze-bundle`) — the skill helps (+24 pp) but only triggers 79% of the time. Read the analysis, open a failed run, then **Generate improved skill**.
4. **Compare** (`/compare`) — No Skill vs SKILL.md vs Explicit vs AGENTS.md. Skills are not always the best delivery mechanism.

No API keys, database, or agent runtime required.
