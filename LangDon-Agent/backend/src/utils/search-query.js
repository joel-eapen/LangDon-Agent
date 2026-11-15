export const MAX_SEARCH_QUERY_LENGTH = 200;

const searchableTokenPattern = /[\p{L}\p{N}]+/gu;

export function normalizeSearchQuery(query) {
  if (typeof query !== "string") {
    return { normalizedQuery: "", ftsQuery: "", tokens: [] };
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new RangeError(
      `Search query must not exceed ${MAX_SEARCH_QUERY_LENGTH} characters`,
    );
  }

  const tokens = trimmedQuery.match(searchableTokenPattern) ?? [];
  return {
    normalizedQuery: tokens.join(" "),
    ftsQuery: tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" AND "),
    tokens,
  };
}
