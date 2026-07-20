/**
 * Thin wrapper around @nut-tree-fork/nut-js for keydown/keyup timing.
 * Build a dry-run mode alongside this (log instead of send) per CLAUDE.md §9 —
 * it's what makes scheduler/conversion development possible without the game open.
 * TODO(build order step 3): implement.
 */
export async function sendKeyDown(_key: string): Promise<void> {
  throw new Error('sendKeyDown is not implemented yet — see CLAUDE.md §9 (build dry-run mode first)')
}

export async function sendKeyUp(_key: string): Promise<void> {
  throw new Error('sendKeyUp is not implemented yet — see CLAUDE.md §9 (build dry-run mode first)')
}
