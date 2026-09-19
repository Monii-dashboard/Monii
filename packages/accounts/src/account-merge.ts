export type AccountMerge = Readonly<{
  canonicalAccountId: string;
  mergedAccountId: string;
}>;

/** Resolves merge aliases without changing the identity of historical facts. */
export function createCanonicalAccountIdResolver(
  merges: readonly AccountMerge[],
) {
  const targetByAccount = new Map(
    merges.map((merge) => [merge.mergedAccountId, merge.canonicalAccountId]),
  );

  return (accountId: string): string => {
    const visited = new Set<string>();
    let current = accountId;

    while (targetByAccount.has(current)) {
      if (visited.has(current)) {
        throw new Error(`Account merge cycle includes ${current}`);
      }
      visited.add(current);
      current = targetByAccount.get(current)!;
    }

    return current;
  };
}

/** Resolves one merge alias without changing historical fact identities. */
export function resolveCanonicalAccountId(
  accountId: string,
  merges: readonly AccountMerge[],
): string {
  return createCanonicalAccountIdResolver(merges)(accountId);
}

export function connectedAccountGroups(
  accountIds: readonly string[],
  pairs: readonly Readonly<{ leftAccountId: string; rightAccountId: string }>[],
): readonly (readonly string[])[] {
  const parent = new Map(accountIds.map((id) => [id, id]));
  const find = (id: string): string => {
    const current = parent.get(id);
    if (!current || current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };

  for (const pair of pairs) {
    const left = find(pair.leftAccountId);
    const right = find(pair.rightAccountId);
    if (left !== right) parent.set(right, left);
  }

  const groups = new Map<string, string[]>();
  for (const id of accountIds) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }

  return [...groups.values()].filter((group) => group.length > 1);
}
