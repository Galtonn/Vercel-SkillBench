import type {
  EvaluationDetail,
  EvaluationSummary,
  ImprovedMetrics,
} from "./types";

export const DEFAULT_TASKS = `Reduce client JavaScript on /dashboard without changing functionality.

Determine why /analytics increased in bundle size.

Identify which dependency contributes the most client-side JavaScript.

Optimize the heaviest route while preserving existing behavior.`;

export const EVALUATIONS: EvaluationSummary[] = [
  {
    id: "analyze-bundle",
    skillPath: "vercel-labs/dev3000/analyze-bundle",
    skillName: "analyze-bundle",
    repo: "vercel-labs/dev3000",
    status: "completed",
    effectiveness: 24,
    triggerRate: 79,
    runs: 48,
    updatedLabel: "2 min ago",
    question:
      "Does this skill improve an agent's ability to diagnose and fix JavaScript bundle problems?",
  },
  {
    id: "nextjs",
    skillPath: "vercel-labs/next-skills/nextjs",
    skillName: "nextjs",
    repo: "vercel-labs/next-skills",
    status: "completed",
    effectiveness: 8,
    triggerRate: 56,
    runs: 60,
    updatedLabel: "18 min ago",
    question:
      "Does this skill improve an agent's ability to follow Next.js App Router conventions?",
  },
  {
    id: "capture-screenshot",
    skillPath: "vercel-labs/agent-browser/capture-screenshot",
    skillName: "capture-screenshot",
    repo: "vercel-labs/agent-browser",
    status: "running",
    effectiveness: null,
    triggerRate: null,
    runs: 48,
    completedRuns: 16,
    updatedLabel: "Started 4 min ago",
    question:
      "Does this skill improve an agent's ability to capture and inspect UI state?",
  },
];

export const ANALYZE_BUNDLE: EvaluationDetail = {
  ...EVALUATIONS[0],
  verdict:
    "The skill substantially improves task success, but agents fail to invoke it reliably.",
  verdictBadge: "Useful, unreliable trigger",
  configs: [
    {
      id: "baseline",
      name: "Baseline",
      success: 58,
      buildPass: 71,
      triggerRate: null,
      avgTokens: 28.4,
      avgRuntime: 64,
    },
    {
      id: "skill",
      name: "Skill",
      success: 82,
      buildPass: 92,
      triggerRate: 79,
      avgTokens: 23.7,
      avgRuntime: 55,
    },
    {
      id: "explicit",
      name: "Explicit Trigger",
      success: 91,
      buildPass: 96,
      triggerRate: 100,
      avgTokens: 24.1,
      avgRuntime: 57,
    },
    {
      id: "agents-md",
      name: "AGENTS.md",
      success: 94,
      buildPass: 98,
      triggerRate: 100,
      avgTokens: 26.2,
      avgRuntime: 59,
    },
  ],
  trigger: {
    expected: 24,
    invoked: 19,
    missed: 5,
    falsePositives: 2,
  },
  triggerNote: "5 tasks failed because the skill was never loaded.",
  analysisIntro:
    "SkillBench analyzed 48 trajectories and found three recurring issues.",
  findings: [
    {
      id: "trigger-too-broad",
      severity: "high",
      title: "Trigger description is too broad",
      explanation:
        'In 5 bundle-related tasks, the agent never loaded the skill. The current description mentions "performance analysis" but doesn\'t explicitly reference route bundles, client JavaScript, or dependency analysis.',
      current: "Use this skill when analyzing application performance.",
      suggested:
        "Use this skill when investigating JavaScript bundle size,\nroute size regressions, unexpected client-side dependencies,\nor opportunities to reduce client JavaScript.",
    },
    {
      id: "loaded-too-early",
      severity: "medium",
      title: "Instructions are loaded too early",
      explanation:
        "Agents that loaded the skill before inspecting the repository made incorrect assumptions in 3 of 24 runs.",
      suggested:
        "Inspect the relevant route and dependency graph before making optimization recommendations.",
    },
    {
      id: "unnecessary-context",
      severity: "low",
      title: "Simple tasks use unnecessary context",
      explanation:
        "For straightforward dependency lookups, the skill increased context usage without improving accuracy.",
      extra: "+18% tokens on simple tasks",
    },
  ],
  failedRuns: [
    {
      id: "run-17",
      runNumber: 17,
      task: "Optimize `/dashboard`",
      taskFull:
        "Reduce client JavaScript on `/dashboard` without changing functionality.",
      configuration: "Skill",
      configId: "skill",
      result: "Failed",
      reason: "Skill not invoked",
      timeline: [
        { time: "00:00", event: "Agent started" },
        { time: "00:03", event: "Read app/dashboard/page.tsx" },
        { time: "00:08", event: "Read package.json" },
        { time: "00:13", event: "Searched for chart imports" },
        { time: "00:21", event: "Proposed dynamic import" },
        { time: "00:29", event: "Build succeeded" },
        { time: "00:34", event: "Evaluation failed", warning: true },
      ],
      why: "The agent made a plausible optimization but never loaded `analyze-bundle`, so it lacked evidence about which modules were actually contributing to the route bundle.",
    },
    {
      id: "run-09",
      runNumber: 9,
      task: "Diagnose `/analytics`",
      taskFull: "Determine why `/analytics` increased in bundle size.",
      configuration: "Skill",
      configId: "skill",
      result: "Failed",
      reason: "Incorrect dependency identified",
      timeline: [
        { time: "00:00", event: "Agent started" },
        { time: "00:04", event: "Loaded analyze-bundle" },
        { time: "00:11", event: "Read app/analytics/page.tsx" },
        { time: "00:18", event: "Attributed growth to recharts" },
        { time: "00:27", event: "Proposed removing unused chart" },
        { time: "00:33", event: "Evaluation failed", warning: true },
      ],
      why: "The skill was loaded, but the agent inspected the route source before generating bundle artifacts. It blamed `recharts` while the regression came from a newly imported date library.",
    },
    {
      id: "run-03",
      runNumber: 3,
      task: "Find largest dependency",
      taskFull:
        "Identify which dependency contributes the most client-side JavaScript.",
      configuration: "Baseline",
      configId: "baseline",
      result: "Failed",
      reason: "No bundle evidence used",
      timeline: [
        { time: "00:00", event: "Agent started" },
        { time: "00:06", event: "Read package.json" },
        { time: "00:14", event: "Ranked dependencies by name popularity" },
        { time: "00:22", event: "Guessed next/font as heaviest" },
        { time: "00:28", event: "Evaluation failed", warning: true },
      ],
      why: "Without the skill, the agent ranked libraries by reputation instead of measuring the client graph. The actual heaviest module was a charting package pulled into the dashboard layout.",
    },
    {
      id: "run-21",
      runNumber: 21,
      task: "Reduce client JS",
      taskFull:
        "Reduce client JavaScript on `/dashboard` without changing functionality.",
      configuration: "Skill",
      configId: "skill",
      result: "Failed",
      reason: "Skill not invoked",
      timeline: [
        { time: "00:00", event: "Agent started" },
        { time: "00:05", event: "Read app/layout.tsx" },
        { time: "00:12", event: "Converted a client component to server" },
        { time: "00:20", event: "Build succeeded" },
        { time: "00:26", event: "Evaluation failed", warning: true },
      ],
      why: "The agent made a valid React Server Component change but never measured the route bundle, so the largest client dependency was left untouched.",
    },
  ],
};

export const NEXTJS_EVAL: EvaluationDetail = {
  ...EVALUATIONS[1],
  verdict:
    "The skill helps on framework-specific tasks, but agents often ignore it in favor of general React knowledge.",
  verdictBadge: "Marginal, weak trigger",
  configs: [
    {
      id: "baseline",
      name: "Baseline",
      success: 64,
      buildPass: 78,
      triggerRate: null,
      avgTokens: 31.2,
      avgRuntime: 71,
    },
    {
      id: "skill",
      name: "Skill",
      success: 72,
      buildPass: 84,
      triggerRate: 56,
      avgTokens: 34.8,
      avgRuntime: 76,
    },
    {
      id: "explicit",
      name: "Explicit Trigger",
      success: 86,
      buildPass: 93,
      triggerRate: 100,
      avgTokens: 33.1,
      avgRuntime: 74,
    },
    {
      id: "agents-md",
      name: "AGENTS.md",
      success: 89,
      buildPass: 95,
      triggerRate: 100,
      avgTokens: 29.4,
      avgRuntime: 68,
    },
  ],
  trigger: {
    expected: 30,
    invoked: 17,
    missed: 13,
    falsePositives: 4,
  },
  triggerNote: "13 tasks failed to load the skill despite matching App Router work.",
  analysisIntro:
    "SkillBench analyzed 60 trajectories and found three recurring issues.",
  findings: [
    {
      id: "too-long",
      severity: "high",
      title: "Skill is too long to load speculatively",
      explanation:
        "The SKILL.md is 1,400+ lines. Agents skip it unless explicitly told, because the description does not make the cost/benefit obvious.",
      current: "Use this skill for Next.js App Router development.",
      suggested:
        "Use this skill when creating or migrating App Router pages,\nserver actions, route handlers, or metadata. Skip it for generic React UI work.",
    },
    {
      id: "conflicts",
      severity: "medium",
      title: "Instructions conflict with model priors",
      explanation:
        "The skill still documents pages/ directory patterns. Agents mixed routing conventions in 6 of 15 failed skill runs.",
      suggested:
        "State that App Router is required. Do not mention pages/ unless the task is a migration.",
    },
    {
      id: "token-cost",
      severity: "low",
      title: "Loaded skill increases tokens on easy tasks",
      explanation:
        "For component-only edits, injecting the full Next.js skill raised token usage without changing the outcome.",
      extra: "+11% tokens on simple tasks",
    },
  ],
  failedRuns: [
    {
      id: "run-11",
      runNumber: 11,
      task: "Add a server action",
      taskFull: "Add a validated server action to the settings form.",
      configuration: "Skill",
      configId: "skill",
      result: "Failed",
      reason: "Skill not invoked",
      timeline: [
        { time: "00:00", event: "Agent started" },
        { time: "00:04", event: "Read app/settings/page.tsx" },
        { time: "00:11", event: "Added a client-side fetch handler" },
        { time: "00:19", event: "Build succeeded" },
        { time: "00:24", event: "Evaluation failed", warning: true },
      ],
      why: "The agent implemented a client fetch instead of a server action because it never loaded the Next.js skill.",
    },
    {
      id: "run-22",
      runNumber: 22,
      task: "Migrate a page",
      taskFull: "Migrate `pages/account.tsx` to the App Router.",
      configuration: "Skill",
      configId: "skill",
      result: "Failed",
      reason: "Mixed routing conventions",
      timeline: [
        { time: "00:00", event: "Agent started" },
        { time: "00:03", event: "Loaded nextjs skill" },
        { time: "00:14", event: "Created app/account/page.tsx" },
        { time: "00:21", event: "Kept getServerSideProps" },
        { time: "00:29", event: "Evaluation failed", warning: true },
      ],
      why: "The skill still mentions pages/ data fetching, so the agent preserved `getServerSideProps` inside an App Router file.",
    },
    {
      id: "run-04",
      runNumber: 4,
      task: "Generate metadata",
      taskFull: "Add static and dynamic metadata to the marketing routes.",
      configuration: "Baseline",
      configId: "baseline",
      result: "Failed",
      reason: "Used next/head",
      timeline: [
        { time: "00:00", event: "Agent started" },
        { time: "00:07", event: "Imported next/head" },
        { time: "00:16", event: "Build succeeded" },
        { time: "00:21", event: "Evaluation failed", warning: true },
      ],
      why: "Without the skill, the agent used the Pages Router head API on an App Router project.",
    },
    {
      id: "run-31",
      runNumber: 31,
      task: "Create a route handler",
      taskFull: "Add a GET route handler for `/api/health`.",
      configuration: "Skill",
      configId: "skill",
      result: "Failed",
      reason: "Skill not invoked",
      timeline: [
        { time: "00:00", event: "Agent started" },
        { time: "00:06", event: "Created pages/api/health.ts" },
        { time: "00:14", event: "Build succeeded" },
        { time: "00:18", event: "Evaluation failed", warning: true },
      ],
      why: "The agent defaulted to Pages API routes because the skill was never loaded.",
    },
  ],
};

export const DETAILS: Record<string, EvaluationDetail> = {
  "analyze-bundle": ANALYZE_BUNDLE,
  nextjs: NEXTJS_EVAL,
};

export const IMPROVED_SKILL: ImprovedMetrics = {
  success: 92,
  triggerRate: 96,
  buildPass: 98,
  avgTokens: 22.9,
  missed: 1,
};

export const PROGRESS_STEPS = [
  "Preparing evaluation environment...",
  "Loading skill...",
  "Running baseline tasks...",
  "Running skill tasks...",
  "Evaluating outputs...",
  "Analyzing trajectories...",
];

export const METRIC_TIPS = {
  "Trigger rate":
    "Percentage of tasks where the skill was loaded when the evaluator expected it to be useful.",
  "Skill effectiveness":
    "Difference in task success between baseline and skill-enabled runs.",
  "Task success":
    "Percentage of runs that satisfied the evaluator's expected outcome.",
  "Build pass":
    "Percentage of runs where the project built successfully after the agent's changes.",
  "Avg tokens":
    "Mean combined input and output tokens across runs in this configuration.",
  "Avg runtime":
    "Mean wall-clock time from agent start to evaluation complete.",
  "Missed invocations":
    "Tasks where the evaluator expected the skill to be loaded and the agent never loaded it.",
};

export function getEvaluation(id: string) {
  return DETAILS[id];
}

export function getSummary(id: string) {
  return EVALUATIONS.find((item) => item.id === id);
}
