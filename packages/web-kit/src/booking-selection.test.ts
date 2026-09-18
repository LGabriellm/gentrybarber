import { expect, test } from 'vitest';
import { bookingSelection } from './booking-selection';

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
