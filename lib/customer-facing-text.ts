const CUSTOMER_UNSAFE_AI_PATTERNS: Array<[RegExp, string]> = [
  [/\bAI[-\s]?generated\b/gi, "AcreX prepared"],
  [/\bAI\s+pricing\b/gi, "smart pricing"],
  [/\bAI\s+adjustment\b/gi, "Quote Adjustment"],
  [/\bAI\s+suggestion\b/gi, "Quote suggestion"],
  [/\bAI\s+estimate\b/gi, "AcreX estimate"],
  [/\bAI\s+draft\b/gi, "draft estimate"],
  [/\bAI\s+notes?\b/gi, "Estimator notes"],
  [/\bAI\s+assumptions?\b/gi, "Estimator assumptions"],
  [/\bAI\s+advisories\b/gi, "Estimator notes"],
  [/\bAI\b/gi, "AcreX"]
];

export function customerSafeText(value: unknown) {
  if (typeof value !== "string") return "";
  const strippedInternalLanguage = value.replace(
    /\b(?:AI confidence|confidence score|pricing assumption|internal warning|debug)\b[^.\n]*/gi,
    ""
  );
  return CUSTOMER_UNSAFE_AI_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    strippedInternalLanguage
  )
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
