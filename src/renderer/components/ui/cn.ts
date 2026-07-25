/** Tiny class-name joiner. Deliberately not `clsx` — this is all we need and it
 *  keeps the redesign free of new runtime dependencies. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
