/** Moves one item to another index, returning a new array; out-of-range is a no-op. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Moves one id in front of another id, for views that know tracks by id rather than
 * by index (the playlist row's index can differ from the stored position).
 */
export function moveById<T extends string>(list: readonly T[], fromId: T, toId: T): T[] {
  return moveItem(list, list.indexOf(fromId), list.indexOf(toId));
}

/**
 * Inserts the item at `insertIndex`, where the index counts the gaps in the original
 * list: 0 is before the first row, `list.length` is after the last one. Removing the
 * item first shifts every later gap left by one, so a downward move lands one earlier.
 */
export function moveToIndex<T>(list: readonly T[], from: number, insertIndex: number): T[] {
  if (from < 0 || from >= list.length) return [...list];
  const target = Math.max(0, Math.min(list.length, Math.round(insertIndex)));
  if (target === from || target === from + 1) return [...list];

  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target > from ? target - 1 : target, 0, item);
  return next;
}

/**
 * The pointer-friendly form: move `fromId` so it sits before `beforeId`, or at the end
 * when `beforeId` is null. Missing ids are a no-op, which keeps a stale drop harmless.
 */
export function moveBefore<T extends string>(
  list: readonly T[],
  fromId: T,
  beforeId: T | null,
): T[] {
  const from = list.indexOf(fromId);
  if (from < 0) return [...list];
  const target = beforeId === null ? list.length : list.indexOf(beforeId);
  if (target < 0) return [...list];
  return moveToIndex(list, from, target);
}
