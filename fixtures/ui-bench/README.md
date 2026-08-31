# ui-bench

A small, controlled UI used as the read-only repository for SkillBench's built-in
`web-design-guidelines` benchmark.

It is deliberately **not** a runnable app. It exists so that an agent can be
asked realistic accessibility and layout questions and answer them from the
source. The issues are planted and documented in the benchmark's judge criteria;
they are not subtle.

Planted issues:

- `app/settings/account-form.tsx` — email input with no label; icon-only submit
  with no accessible name; a clickable `div` used as a button.
- `components/hero.tsx` — marketing image with no `alt`.
- `app/dashboard/page.tsx` — heading skip (`h1` then `h4`); a clickable `div`
  that opens details.
- `app/layout.tsx` / `app/globals.css` — fixed 1440px shell that does not reflow.

`lib/format-name.ts` and `app/about/page.tsx` are ordinary code with no
accessibility defects. They exist so the benchmark can include tasks the
web-design skill should not trigger on.

SkillBench mounts this directory read-only. Agents get `list_files` and
`read_file`; there is no write path and no shell.
