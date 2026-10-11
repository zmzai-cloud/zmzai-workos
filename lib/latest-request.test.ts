import { expect, it } from 'vitest';
import { LatestRequest } from './latest-request';
it('ignores an old response during the next input debounce', () => {
  const requests = new LatestRequest();
  const old = requests.begin();
  requests.invalidate();
  expect(old.signal.aborted).toBe(true);
  expect(requests.isCurrent(old)).toBe(false);
  const next = requests.begin();
  expect(requests.isCurrent(next)).toBe(true);
});
it('clearing input prevents a late response from replacing recent items', () => {
  const requests = new LatestRequest();
  const old = requests.begin();
  const next = requests.begin();
  requests.invalidate();
  expect(requests.isCurrent(old)).toBe(false);
  expect(requests.isCurrent(next)).toBe(false);
});
