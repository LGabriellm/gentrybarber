import { describe, it, expect } from 'vitest';
import { colorContrast, resolveDesignTokens } from '@platform/design-system';
import { applyDesignDirection, designDirections } from './design-directions';
import { siteEditorConfigSchema, siteImageSchema, type SiteEditorConfig } from './site-editor';

const image = { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0b8AAAAASUVORK5CYII=', alt: 'Detalhe do espaço' };
const original: SiteEditorConfig = { tokens: {}, content: { title: 'Marca A', description: '', heroTitle: 'Uma história própria', heroSubtitle: '', heroImage: image, sections: [{ id: 'prices', type: 'services', title: 'Nossos serviços', body: '', visible: true }] }, code: { enabled: false, html: '<barber-booking />', css: '' } };

describe('Brand directions and media boundaries', () => {
  it.each(designDirections)('applies $name with readable surfaces and preserves brand content', direction => {
    const result = applyDesignDirection(original, direction.id);
    const tokens = resolveDesignTokens(result.tokens);
    expect(colorContrast(tokens.textColor, tokens.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(colorContrast(tokens.textColor, tokens.surfaceColor)).toBeGreaterThanOrEqual(4.5);
    expect(result.content.sections).toEqual(original.content.sections);
    expect(result.content.heroImage).toEqual(image);
    expect(result.content.heroTitle).toBe(original.content.heroTitle);
    expect(result.code).toEqual(original.code);
    result.content.sections[0]!.title = 'Changed';
    result.content.appearance!.width = 'narrow';
    expect(original.content.sections[0]!.title).toBe('Nossos serviços');
    expect(applyDesignDirection(original, direction.id).content.appearance).toEqual(direction.appearance);
  });
  it('accepts legacy snapshots without opting them into a new composition', () => {
    const legacy = { tokens: {}, content: { ...original.content, heroImage: undefined } };
    expect(siteEditorConfigSchema.parse(legacy).content.appearance).toBeUndefined();
  });
  it.each(['https://external.example/photo.jpg', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,PHNjcmlwdD4=', 'data:image/webp;base64,aW52YWxpZA=='])('rejects external or forged media %s', src => {
    expect(siteImageSchema.safeParse({ ...image, src }).success).toBe(false);
  });
  it('bounds individual images, gallery count, total document and unknown style properties', () => {
    expect(siteImageSchema.safeParse({ ...image, alt: '' }).success).toBe(false);
    expect(siteImageSchema.safeParse({ ...image, src: image.src + 'A'.repeat(80000) }).success).toBe(false);
    expect(siteEditorConfigSchema.safeParse({ ...original, content: { ...original.content, appearance: { customScript: 'alert(1)' } } }).success).toBe(false);
    expect(siteEditorConfigSchema.safeParse({ ...original, content: { ...original.content, sections: [{ ...original.content.sections[0], type: 'gallery', gallery: Array(9).fill(image) }] } }).success).toBe(false);
    const largeImage = { ...image, src: `data:image/png;base64,${btoa('\x89PNG\r\n\x1a\n' + 'a'.repeat(50000))}` };
    const sections = Array.from({ length: 3 }, (_, i) => ({ id: `gallery-${i}`, type: 'gallery', title: 'Fotos', body: '', visible: true, gallery: Array(8).fill(largeImage) }));
    expect(siteEditorConfigSchema.safeParse({ ...original, content: { ...original.content, sections } }).success).toBe(false);
  });
});
