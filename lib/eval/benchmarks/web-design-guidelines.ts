import type { EvalTask } from "../types";

/**
 * Built-in benchmark for `vercel-labs/agent-skills/web-design-guidelines`.
 *
 * Seven tasks over the read-only `fixtures/ui-bench` repository. Five are
 * genuinely helped by a UI/accessibility skill; two are not. The non-relevant
 * tasks are ordinary rename and copy work in the same repo, so false-positive
 * skill loading is measurable.
 *
 * Every judged task has task-specific criteria and a reference answer. The
 * planted defects are in the fixture source, not inferred from the skill.
 */

export const WEB_DESIGN_BENCHMARK_ID = "web-design-guidelines";

export const WEB_DESIGN_SKILL_REFERENCE =
  "vercel-labs/agent-skills/web-design-guidelines";

export const WEB_DESIGN_REPO = "fixtures/ui-bench";

export const WEB_DESIGN_QUESTION =
  "Does this skill improve an agent's ability to find and fix UI accessibility and layout problems?";

export const WEB_DESIGN_TASKS: EvalTask[] = [
  {
    id: "settings-form-a11y",
    name: "Review the settings form for accessibility",
    skillRelevant: true,
    prompt:
      "Review the settings form for accessibility issues. List every problem you find, name the file it lives in, and say how you would fix it.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Identifies that the email input in app/settings/account-form.tsx has no associated label (no <label>, htmlFor, or aria-label).",
        "Identifies that the submit control is an icon-only button with no accessible name (the visible content is a decorative arrow in components/icon-button.tsx).",
        "Identifies that 'Save draft' is a clickable div rather than a button, so it is not keyboard-operable and has no implicit button semantics.",
        "Does not invent unrelated defects (color contrast, missing lang, missing skip link) as the primary findings.",
      ],
      referenceAnswer:
        "The email input in app/settings/account-form.tsx has a placeholder but no label. The submit control in components/icon-button.tsx is an icon-only button whose only content is an aria-hidden arrow, so it has no accessible name. 'Save draft' is a clickable div with class fake-button; it should be a <button type=\"button\">.",
    },
  },
  {
    id: "homepage-missing-alt",
    name: "Homepage image missing alternative text",
    skillRelevant: true,
    prompt:
      "The homepage hero feels unfinished. Check whether the imagery is acceptable for an accessible marketing page and report what you would change.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Identifies that the hero image in components/hero.tsx has no alt attribute.",
        "States that a meaningful alt (or alt=\"\" if decorative, with a reason) is required.",
        "Does not claim the image is missing from the page; the <img> is present, it is the alt that is missing.",
      ],
      referenceAnswer:
        "components/hero.tsx renders an <img> for /images/operations-hero.jpg with width and height but no alt. Add a short descriptive alt such as 'Operations dashboard overview', or mark it decorative with alt=\"\" if the adjacent heading already conveys the same meaning.",
    },
  },
  {
    id: "dashboard-heading-hierarchy",
    name: "Dashboard heading hierarchy",
    skillRelevant: true,
    prompt:
      "A teammate said the dashboard is hard to scan with a screen reader. Inspect the heading structure on /dashboard and say whether it is well formed.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Identifies that app/dashboard/page.tsx skips heading levels: an h1 ('Dashboard') is followed by an h4 ('Outstanding invoices').",
        "Recommends using h2 (or otherwise not skipping ranks) for the invoices section.",
      ],
      referenceAnswer:
        "app/dashboard/page.tsx uses <h1>Dashboard</h1> then <h4>Outstanding invoices</h4>, skipping h2 and h3. Change the invoices heading to h2 so the outline is sequential.",
    },
  },
  {
    id: "dashboard-clickable-div",
    name: "Dashboard clickable div",
    skillRelevant: true,
    prompt:
      "On the dashboard, 'Open invoice' is supposed to take people to the invoice. Check whether that control is implemented accessibly.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Identifies that 'Open invoice' in app/dashboard/page.tsx is a clickable div, not a button or a link.",
        "Notes the consequence: no implicit keyboard support and no button/link semantics.",
        "Recommends a <button> or an <a href> depending on whether the action navigates or performs an in-page action.",
      ],
      referenceAnswer:
        "'Open invoice' is a div with onClick that assigns window.location.href. Use an <a href=\"/settings\"> (or the real invoice URL) so it is a link, or a button that navigates. A clickable div is not keyboard-accessible by default.",
    },
  },
  {
    id: "fixed-width-mobile",
    name: "Layout breaks on a narrow viewport",
    skillRelevant: true,
    prompt:
      "Design wants this admin to work on a phone. Inspect how the shell is sized and report whether a 390px-wide viewport would work.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Identifies a fixed 1440px width on the page shell: app/layout.tsx uses class 'shell', and app/globals.css sets .shell { width: 1440px } (and the hero image is also 1440px wide).",
        "States that a fixed pixel width will overflow on a ~390px viewport rather than reflow.",
        "Proposes a responsive fix such as max-width: 1440px with width: 100%, or removing the fixed width.",
      ],
      referenceAnswer:
        "The layout wraps content in a div.shell, and app/globals.css sets .shell { width: 1440px }. The hero image is also width={1440}. On a 390px viewport the shell will overflow horizontally. Use max-width: 1440px; width: 100% (and max-width on the image) so it can shrink.",
    },
  },
  {
    id: "rename-format-user-name",
    name: "Rename formatUserName",
    skillRelevant: false,
    prompt:
      "Rename the `formatUserName` function to `formatPersonName`. List every file that has to change and show the edits. Keep the rest of the repository's naming conventions.",
    expected: {
      type: "contains",
      values: ["formatPersonName", "lib/format-name.ts"],
    },
  },
  {
    id: "about-support-address",
    name: "Update the About support address",
    skillRelevant: false,
    prompt:
      "On the About page, change the support address from help@northwind.example to support@northwind.example. Name the file and the new string.",
    expected: {
      type: "contains",
      values: ["support@northwind.example", "app/about/page.tsx"],
    },
  },
];
