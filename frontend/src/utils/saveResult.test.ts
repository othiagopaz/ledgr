import { describe, it, expect } from 'vitest';

/**
 * The register's save handlers must THROW on a refused write.
 *
 * They used to do `if (result.success) { ...commit... }` with no else, so a
 * rejected write did nothing at all: the editor stayed open, no message
 * appeared, and Enter looked like a dead key. The inline editor learns about
 * failure only by `await onSave(...)` rejecting.
 *
 * This mirrors the handler contract so the silent-failure shape can't come
 * back unnoticed.
 */
type MutationResponse = { success: boolean; errors?: string[] };

async function saveOrThrow(
  result: MutationResponse,
  commit: () => void,
): Promise<void> {
  if (!result.success) {
    throw new Error(result.errors?.join(', ') || 'Could not save this transaction.');
  }
  commit();
}

describe('save handler contract', () => {
  it('commits on success', async () => {
    let committed = false;
    await saveOrThrow({ success: true }, () => { committed = true; });
    expect(committed).toBe(true);
  });

  it('throws on failure instead of doing nothing', async () => {
    let committed = false;
    await expect(
      saveOrThrow({ success: false, errors: ['nope'] }, () => { committed = true; }),
    ).rejects.toThrow('nope');
    expect(committed).toBe(false);
  });

  it('joins several backend errors into one message', async () => {
    await expect(
      saveOrThrow({ success: false, errors: ['a', 'b'] }, () => {}),
    ).rejects.toThrow('a, b');
  });

  it('falls back to a readable message when the backend sends none', async () => {
    await expect(
      saveOrThrow({ success: false }, () => {}),
    ).rejects.toThrow('Could not save this transaction.');
  });
});
