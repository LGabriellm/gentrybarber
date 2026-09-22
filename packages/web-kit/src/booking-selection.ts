/** Presentation-only choice: never guess the first candidate when there is more than one. */
export function bookingSelection<T extends { id: string }>(options: readonly T[], selected: string): string {
  if (options.length === 1) return options[0]!.id;
  return options.some(option => option.id === selected) ? selected : '';
}

/** A single professional must be able to deliver the complete selected bundle. */
export function professionalsForServices<T extends { serviceIds?: readonly string[] }>(professionals: readonly T[], serviceIds: readonly string[]): T[] {
  if (!serviceIds.length) return [];
  return professionals.filter(professional => serviceIds.every(serviceId => professional.serviceIds?.includes(serviceId)));
}
