export function isUniqueViolation(error: unknown): boolean {
  let candidate = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof candidate !== "object" || candidate === null) return false;
    if (
      "code" in candidate &&
      (candidate as { code?: unknown }).code === "23505"
    ) {
      return true;
    }
    candidate = "cause" in candidate ? candidate.cause : null;
  }
  return false;
}
