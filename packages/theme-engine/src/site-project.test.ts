import { describe, expect, it } from 'vitest';
import { parseSiteProject, exportSiteProject } from './site-project';
import { siteCodeSchema } from './site-editor';
import { studioUtilities } from './site-assets';
import { validateSiteCss } from './site-code';
const src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0b8AAAAASUVORK5CYII=';
const code = { enabled: true, html: '<main class="container"><img src="assets/photo.png" alt="Nossa barbearia" loading="lazy" /><barber-booking class="agenda" /></main>', css: '.agenda { color: #123456; }', assets: [{ name: 'photo.png', src }] };
const config = { code, tokens: {}, content: { title: 'Site A', description: '', heroTitle: 'Marca A', heroSubtitle: '', sections: [] } };
describe('Portable site projects', () => {
  it('round trips source and embedded images without tenant identity or publication authority', () => {
    expect(parseSiteProject(exportSiteProject(config)).config).toEqual(config);
    expect(() => parseSiteProject(JSON.stringify({ format: 'barber-site', version: 1, config, tenantId: 'foreign' }))).toThrow();
    expect(() => exportSiteProject({ ...config, published: true })).toThrow();
    expect(validateSiteCss(studioUtilities)).toBe(studioUtilities);
  });
  it('requires each asset reference to exist in the same version', () => {
    expect(siteCodeSchema.safeParse(code).success).toBe(true);
    expect(siteCodeSchema.safeParse({ ...code, assets: [] }).success).toBe(false);
    expect(siteCodeSchema.safeParse({ ...code, assets: [...code.assets, ...code.assets] }).success).toBe(false);
  });
  it.each(['../photo.png', 'photo.svg', 'photo.js', 'photo.jpg', 'photo.png.exe'])('rejects traversal, active content and mismatched extension %s', name => {
    expect(siteCodeSchema.safeParse({ ...code, assets: [{ name, src }] }).success).toBe(false);
  });
  it('rejects spoofed image data, external assets, oversize and unknown project versions', () => {
    for (const invalid of ['data:image/png;base64,PHNjcmlwdD4=', 'https://example.test/photo.png', src.repeat(900)]) expect(siteCodeSchema.safeParse({ ...code, assets: [{ name: 'photo.png', src: invalid }] }).success).toBe(false);
    expect(() => parseSiteProject(JSON.stringify({ format: 'barber-site', version: 2, config }))).toThrow();
    expect(() => parseSiteProject(' '.repeat(950001))).toThrow();
  });
});
