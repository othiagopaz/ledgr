/**
 * Helpers for previewing an account rename.
 *
 * The backend owns the actual rewrite (see `backend/account_rename.py`); these
 * are for showing the user what they are about to agree to.
 */

/**
 * Where an account ends up after its ancestor is renamed.
 *
 * `renamedTo('Assets:Invest:XP:Bonds', 'Assets:Invest:XP', 'Assets:Invest:Rico')`
 * → `'Assets:Invest:Rico:Bonds'`
 *
 * Accounts outside the renamed subtree come back unchanged, which is what makes
 * this safe to map over a whole list. The boundary check matters: a plain
 * `startsWith` would treat `Assets:Invest:XPTruco` as nested under
 * `Assets:Invest:XP` and mangle it.
 */
export function renamedTo(
  account: string,
  oldName: string,
  newName: string,
): string {
  if (account === oldName) return newName;
  if (account.startsWith(oldName + ":")) {
    return newName + account.slice(oldName.length);
  }
  return account;
}

/**
 * Accounts a rename would move: the account itself, plus its subtree when
 * `includeChildren`. Same boundary rule as `renamedTo`.
 */
export function affectedAccounts(
  allAccounts: string[],
  oldName: string,
  includeChildren: boolean,
): string[] {
  return allAccounts
    .filter(
      (a) =>
        a === oldName || (includeChildren && a.startsWith(oldName + ":")),
    )
    .sort();
}

/** Reasons a rename target is not acceptable, or null when it is fine. */
export function validateRenameTarget(
  target: string,
  currentName: string,
  existingAccounts: string[],
): string | null {
  const trimmed = target.trim();
  if (!trimmed) return "Enter a new account name";
  if (trimmed === currentName) return "New name is identical to the current one";

  const parts = trimmed.split(":");
  if (parts.length < 2) {
    return "Account must have at least two segments (e.g. Assets:Checking)";
  }
  if (parts.some((p) => !p)) return "Account segments must be non-empty";

  // Roots decide which ledgr-types are legal, so the backend refuses a root
  // change outright — catch it here rather than round-tripping to a 400.
  if (parts[0] !== currentName.split(":")[0]) {
    return `Cannot change the root (${currentName.split(":")[0]} → ${parts[0]})`;
  }
  if (existingAccounts.includes(trimmed)) {
    return `Account '${trimmed}' already exists`;
  }
  return null;
}
