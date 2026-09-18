/** Presentation-only choice: never guess the first candidate when there is more than one. */
export function bookingSelection<T extends { id: string }>(options: readonly T[], selected: string): string {
  if (options.length === 1) return options[0]!.id;
  return options.some(option => option.id === selected) ? selected : '';
}
