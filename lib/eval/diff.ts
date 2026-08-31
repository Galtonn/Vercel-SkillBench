/**
 * Minimal line diff for the SKILL.md revision view.
 *
 * Produces lines prefixed with "-", "+", or a space, restricted to changed
 * regions plus a little context, which is what the existing DiffBlock renders.
 */

type Op = { kind: "keep" | "remove" | "add"; line: string };

function lcsMatrix(a: string[], b: string[]) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

function diffOps(a: string[], b: string[]): Op[] {
  const table = lcsMatrix(a, b);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: "keep", line: a[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ kind: "remove", line: a[i] });
      i += 1;
    } else {
      ops.push({ kind: "add", line: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    ops.push({ kind: "remove", line: a[i] });
    i += 1;
  }
  while (j < b.length) {
    ops.push({ kind: "add", line: b[j] });
    j += 1;
  }
  return ops;
}

export function buildDiffLines(
  before: string,
  after: string,
  options: { context?: number; maxLines?: number } = {},
): string[] {
  const context = options.context ?? 2;
  const maxLines = options.maxLines ?? 80;

  const ops = diffOps(before.split("\n"), after.split("\n"));
  const changed = ops
    .map((op, index) => (op.kind === "keep" ? -1 : index))
    .filter((index) => index >= 0);

  if (changed.length === 0) return ["  (no changes)"];

  const keep = new Set<number>();
  for (const index of changed) {
    for (let offset = -context; offset <= context; offset += 1) {
      const target = index + offset;
      if (target >= 0 && target < ops.length) keep.add(target);
    }
  }

  const indices = [...keep].sort((a, b) => a - b);
  const lines: string[] = [];
  let previous = -1;

  for (const index of indices) {
    if (previous >= 0 && index > previous + 1) lines.push("  …");
    const op = ops[index];
    lines.push(
      op.kind === "add" ? `+ ${op.line}` : op.kind === "remove" ? `- ${op.line}` : `  ${op.line}`,
    );
    previous = index;
    if (lines.length >= maxLines) {
      lines.push("  … diff truncated");
      break;
    }
  }

  return lines;
}
