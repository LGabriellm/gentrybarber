import { expect, test } from 'vitest';
import { bookingSelection, professionalsForServices } from './booking-selection';

test('selects the only eligible candidate, including after a service change', () => {
  expect(bookingSelection([{ id: 'solo' }], '')).toBe('solo');
  expect(bookingSelection([{ id: 'other-service' }], 'solo')).toBe('other-service');
});
test('requires a choice for multiple candidates and drops stale selections', () => {
  expect(bookingSelection([{ id: 'a' }, { id: 'b' }], '')).toBe('');
  expect(bookingSelection([{ id: 'a' }, { id: 'b' }], 'removed')).toBe('');
  expect(bookingSelection([{ id: 'a' }, { id: 'b' }], 'b')).toBe('b');
  expect(bookingSelection([], 'removed')).toBe('');
});

test('keeps only professionals who perform every selected service', () => {
  const professionals = [
    { id: 'complete', serviceIds: ['hair', 'beard', 'brow'] },
    { id: 'partial', serviceIds: ['hair', 'beard'] },
    { id: 'other', serviceIds: ['brow'] },
  ];
  expect(professionalsForServices(professionals, [])).toEqual([]);
  expect(professionalsForServices(professionals, ['hair'])).toEqual([professionals[0], professionals[1]]);
  expect(professionalsForServices(professionals, ['hair', 'beard', 'brow'])).toEqual([professionals[0]]);
});
