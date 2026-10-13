/**
 * `next`, with every item that equals the item of the same key in `previous`
 * swapped for that earlier object, and `previous` itself when nothing differs.
 * A rebuilt list then only changes identity where its content changed, so
 * memoised rows that received an equal item are not rendered again and keep
 * their own state. Items must be plain data.
 */
export function keepUnchanged<Item>(
  previous: readonly Item[] | null | undefined,
  next: Item[],
  keyOf: (item: Item) => string,
): Item[] {
  if (!previous) return next;
  const known = new Map(previous.map((item) => [keyOf(item), item]));
  let same = previous.length === next.length;
  const kept = next.map((item, index) => {
    const earlier = known.get(keyOf(item));
    if (earlier && JSON.stringify(earlier) === JSON.stringify(item)) {
      if (previous[index] !== earlier) same = false;
      return earlier;
    }
    same = false;
    return item;
  });
  return same ? (previous as Item[]) : kept;
}
