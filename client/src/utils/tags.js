/**
 * Tag / multi-value normalization shared by the mentor forms and mentor
 * discovery.
 *
 * A "tag list" is authored as free text like "Python, React, Node.js" (or with
 * the Arabic comma: "Python، React، Node.js"). It must round-trip as INDIVIDUAL
 * values everywhere: stored one-per-row (Technology / MentoringTopic /
 * SpokenLanguage), offered as individual filter chips, and matched individually.
 *
 * Rules:
 *   - split on the ASCII comma "," and the Arabic comma "،" only
 *     (never on "." — keeps "Node.js", ".NET"; never on "+"/"#" — keeps
 *     "C++", "C#")
 *   - trim surrounding whitespace on every value
 *   - drop empty values
 *   - de-duplicate case-insensitively, keeping the first spelling seen as the
 *     display label
 */
const SEPARATORS = /[,،]/;

/** "  Python,React,  Node.js , python " -> ["Python", "React", "Node.js"]
 *  Accepts a string OR an array (array elements are themselves split/trimmed). */
export function splitTags(input) {
  const parts = Array.isArray(input)
    ? input.flatMap((v) => String(v ?? "").split(SEPARATORS))
    : String(input ?? "").split(SEPARATORS);

  const seen = new Set();
  const out = [];
  for (const raw of parts) {
    const value = String(raw).trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** Case-insensitive, whitespace-insensitive equality for a single tag. */
export function sameTag(a, b) {
  return (
    String(a ?? "").trim().toLocaleLowerCase() ===
    String(b ?? "").trim().toLocaleLowerCase()
  );
}

/** Normalize + de-dupe (case-insensitive) + sort — for building filter options. */
export function uniqueTags(values) {
  return splitTags(values).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}
