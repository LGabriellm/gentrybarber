import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { locationLinks, safeMapEmbed, shareLocation } from './location-links';
import { LocationMap } from './location-map';

describe('Public location component', () => {
  const location = { address: 'Rua A & B, 110', city: 'Cidade', state: 'PE', id: 'unit-a', timezone: 'America/Sao_Paulo' };
  const tenant = { id: 'tenant-a', name: 'Marca A', slug: 'a', description: '', contact: {}, location };
  it('encodes one complete address consistently across providers, without leaking parameters', () => {
    const links = locationLinks(location)!;
    for (const key of ['google', 'waze', 'apple', 'embed'] as const) {
      const url = new URL(links[key]);
      expect(url.protocol).toBe('https:');
      expect(url.searchParams.get(key === 'google' ? 'query' : 'q')).toBe('Rua A & B, 110, Cidade, PE, Brasil');
      expect(url.searchParams.has('B')).toBe(false);
    }
    expect(new URL(links.google).searchParams.get('api')).toBe('1');
    expect(new URL(links.waze).searchParams.get('navigate')).toBe('yes');
  });
  it('does not invent a position when the address is incomplete', () => {
    expect(locationLinks({ ...location, address: ' ' })).toBeNull();
    expect(locationLinks({ ...location, city: '' })).toBeNull();
    const html = renderToStaticMarkup(<LocationMap tenant={{ ...tenant, location: { ...location, address: '' } }} />);
    expect(html).toContain('endereço da unidade estiver completo');
    expect(html).not.toContain('maps.google');
    expect(html).not.toContain('<iframe');
  });
  it('rejects lookalike hosts, non-embed paths and injected credentials', () => {
    for (const value of ['javascript:alert(1)', 'https://www.google.com.evil/maps/embed', 'https://www.google.com/maps/embed-evil', 'https://user@www.google.com/maps/embed', 'https://www.google.com/url?q=https://evil.test', 'https://evil.test/maps/embed']) expect(safeMapEmbed(value)).toBeUndefined();
    expect(safeMapEmbed('https://www.google.com/maps/embed?pb=abc')).toBe('https://www.google.com/maps/embed?pb=abc');
  });
  it('keeps locations isolated and escapes the public name', () => {
    const first = renderToStaticMarkup(<LocationMap tenant={tenant} />);
    const second = renderToStaticMarkup(<LocationMap tenant={{ ...tenant, id: 'tenant-b', name: '<script>B</script>', location: { ...location, address: 'Rua Exclusiva B' } }} />);
    expect(first).toContain('Google Maps'); expect(first).toContain('Waze'); expect(first).toContain('Apple Maps'); expect(first).toContain('Compartilhar localização');
    expect(second).not.toContain('Rua A'); expect(first).not.toContain('Rua Exclusiva B'); expect(second).not.toContain('<script>');
  });
  it('starts with one accessible share icon and keeps the app choices in a closed disclosure', () => {
    const html = renderToStaticMarkup(<LocationMap tenant={tenant} />);
    expect(html).toContain('<summary class="location-map-trigger" aria-label="Compartilhar localização"');
    expect(html).toContain('<details class="location-map-disclosure">');
    expect(html).not.toContain('<details class="location-map-disclosure" open');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('class="location-map-actions"');
  });
});

describe('Location sharing fallbacks', () => {
  const data = { title: 'Marca', url: 'https://www.google.com/maps/search/?api=1&query=Rua' };
  it('uses native sharing and does not copy after success or cancellation', async () => {
    const writeText = vi.fn();
    expect(await shareLocation({ share: vi.fn().mockResolvedValue(undefined), clipboard: { writeText } }, data)).toBe('shared');
    expect(await shareLocation({ share: vi.fn().mockRejectedValue({ name: 'AbortError' }), clipboard: { writeText } }, data)).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });
  it('copies when native sharing is missing or denied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareLocation({ clipboard: { writeText } }, data)).toBe('copied');
    expect(await shareLocation({ share: vi.fn().mockRejectedValue({ name: 'NotAllowedError' }), clipboard: { writeText } }, data)).toBe('copied');
    expect(writeText).toHaveBeenLastCalledWith(data.url);
  });
  it('offers manual copying when browser permissions or APIs are unavailable', async () => {
    expect(await shareLocation({}, data)).toBe('manual');
    expect(await shareLocation({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } }, data)).toBe('manual');
  });
});
