/** Event log sequence is per session. A Run plus sequence identifies a rendered update. */
export function acceptEvent(seen: Set<string>, runId: string, seq: number): boolean {
  if (!runId || !Number.isSafeInteger(seq) || seq < 1) return false;
  const key = `${runId}:${seq}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
