/** 轻量行级 diff（LCS），输出可被 theme DiffView 解析的 unified diff 文本。
 *  用于 AI 改写笔记前的差异预览，规模在笔记正文量级（几千行内）足够。 */

type Op = { type: "context" | "add" | "remove"; text: string };

function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // 上限保护：正文太大时退化为整块替换，避免 O(n*m) 爆内存。
  if (n * m > 4_000_000) {
    return [...a.map((text) => ({ type: "remove" as const, text })), ...b.map((text) => ({ type: "add" as const, text }))];
  }
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "context", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove", text: a[i] });
      i += 1;
    } else {
      ops.push({ type: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: "remove", text: a[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: "add", text: b[j] });
    j += 1;
  }
  return ops;
}

const CONTEXT = 2;

/** 把 op 序列切成 hunk 窗口：每个变更块前后带 2 行上下文，相邻窗口合并。 */
function hunkWindows(ops: Op[]): Array<{ start: number; end: number }> {
  const windows: Array<{ start: number; end: number }> = [];
  let index = 0;
  while (index < ops.length) {
    while (index < ops.length && ops[index].type === "context") index += 1;
    if (index >= ops.length) break;
    const changeStart = index;
    while (index < ops.length && ops[index].type !== "context") index += 1;
    const changeEnd = index;
    const start = Math.max(0, changeStart - CONTEXT);
    const end = Math.min(ops.length, changeEnd + CONTEXT);
    const last = windows[windows.length - 1];
    if (last && start <= last.end) last.end = end;
    else windows.push({ start, end });
  }
  return windows;
}

export function unifiedLineDiff(oldText: string, newText: string, path = "笔记正文"): string {
  const a = oldText.length ? oldText.split("\n") : [];
  const b = newText.length ? newText.split("\n") : [];
  const ops = lcsOps(a, b);
  const windows = hunkWindows(ops);
  if (windows.length === 0) return "";

  const lines: string[] = [`--- ${path}`, `+++ ${path}`];
  for (const window of windows) {
    // 行号从 1 起；仅上下文时 unified 惯例用「起始行-1, 0」。
    let oldStart = 0;
    let newStart = 0;
    for (let k = 0; k < window.start; k += 1) {
      if (ops[k].type !== "add") oldStart += 1;
      if (ops[k].type !== "remove") newStart += 1;
    }
    let oldCount = 0;
    let newCount = 0;
    for (let k = window.start; k < window.end; k += 1) {
      if (ops[k].type !== "add") oldCount += 1;
      if (ops[k].type !== "remove") newCount += 1;
    }
    const oldHeader = oldCount === 0 ? `${Math.max(oldStart, 1)},0` : `${oldStart + 1},${oldCount}`;
    const newHeader = newCount === 0 ? `${Math.max(newStart, 1)},0` : `${newStart + 1},${newCount}`;
    lines.push(`@@ -${oldHeader} +${newHeader} @@`);
    for (let k = window.start; k < window.end; k += 1) {
      const op = ops[k];
      lines.push(`${op.type === "add" ? "+" : op.type === "remove" ? "-" : " "}${op.text}`);
    }
  }
  return lines.join("\n");
}
