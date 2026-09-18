import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClassicTheme } from './standard/classic';
import type { PublicSiteData } from '@platform/theme-engine';
import { applyDesignDirection } from '@platform/theme-engine';

describe('Structured website presentation', () => {
  it('renders distinct brands, Core prices, readable paragraphs and only visible gallery images', () => {
    const base = { tokens: {}, content: { title: 'Marca', description: '', heroTitle: 'Nossa identidade', heroSubtitle: 'Feito aqui', sections: [{ id: 'story', type: 'text' as const, title: 'História', body: 'Primeiro parágrafo.\n\nSegundo parágrafo.', visible: true }, { id: 'prices', type: 'services' as const, title: 'Preços', body: '', visible: true }, { id: 'gallery', type: 'gallery' as const, title: 'Galeria privada', body: '', visible: false }] } };
    const data: PublicSiteData = { tenant: { id: 'a', name: 'Ateliê A', slug: 'a', description: '', contact: {}, location: { id: 'unit', address: '', city: '', state: '', timezone: 'America/Sao_Paulo' } }, services: [{ id: 'service', name: 'Corte do catálogo', priceLabel: 'R$ 93,00', durationMinutes: 40 }] };
    const first = renderToStaticMarkup(<ClassicTheme data={{ ...data, ...applyDesignDirection(base, 'atelier') }} />);
    const second = renderToStaticMarkup(<ClassicTheme data={{ ...data, tenant: { ...data.tenant, name: 'Clube B' }, ...applyDesignDirection(base, 'nocturne') }} />);
    expect(first).toContain('data-layout="editorial"'); expect(second).toContain('data-layout="poster"');
    expect(first).toContain('<p>Primeiro parágrafo.</p><p>Segundo parágrafo.</p>');
    expect(first).toContain('R$ 93,00'); expect(second).toContain('Corte do catálogo');
    expect(first).not.toContain('Galeria privada'); expect(second).not.toContain('Ateliê A');
  });
  it('renders visible sections in saved order and escapes user content', () => {
    const data: PublicSiteData = { tenant: { id: 'tenant-a', name: 'Barbearia A', slug: 'a', description: '', contact: {}, location: { id: 'unit-a', address: '', city: '', state: '', timezone: 'America/Sao_Paulo' } }, content: { title: 'Site', description: '', heroTitle: '<script>alert(1)</script>', heroSubtitle: '', sections: [{ id: 'second', type: 'text', title: 'Segundo primeiro', body: '<img src=x onerror=alert(1)>', visible: true }, { id: 'hidden', type: 'text', title: 'Hidden private draft', body: '', visible: false }, { id: 'first', type: 'text', title: 'Primeiro depois', body: '', visible: true }] } };
    const html = renderToStaticMarkup(<ClassicTheme data={data} />);
    expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x'); expect(html).not.toContain('Hidden private draft');
    expect(html.indexOf('section-second')).toBeLessThan(html.indexOf('section-first'));
    const other = renderToStaticMarkup(<ClassicTheme data={{ ...data, content: undefined, tenant: { ...data.tenant, id: 'tenant-b', name: 'Barbearia B' } }} />);
    expect(other).not.toContain('Segundo primeiro'); expect(other).not.toContain('Barbearia A');
  });
});
