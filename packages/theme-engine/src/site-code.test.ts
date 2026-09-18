import { describe, expect, it } from 'vitest';
import { defaultSiteCss, defaultSiteHtml, parseSiteHtml, validateSiteCss } from './site-code';
import { siteCodeSchema } from './site-editor';

describe('Bounded website code', () => {
  it('accepts a complete layout, reusable Core blocks and responsive CSS', () => {
    expect(siteCodeSchema.safeParse({ enabled: true, html: defaultSiteHtml, css: defaultSiteCss }).success).toBe(true);
    expect(parseSiteHtml('<section id="agenda"><h2>Estilo &amp; cuidado</h2><barber-booking /></section>')[0]).toMatchObject({ tag: 'section', children: [{ tag: 'h2', children: ['Estilo & cuidado'] }, { tag: 'barber-booking' }] });
    expect(validateSiteCss('.page { --space: 20px; padding: var(--space); background: linear-gradient(90deg, #fff, #eee); } @media (max-width: 600px) { .page { display: grid; } }')).toContain('@media');
  });
  it('accepts the reviewed WhatsApp block without a tenant-supplied destination', () => {
    expect(parseSiteHtml('<barber-whatsapp />')).toMatchObject([{ tag: 'barber-whatsapp', attrs: {} }]);
    expect(() => parseSiteHtml('<barber-whatsapp href="https://wa.me/5511999999999" />')).toThrow();
  });
  it.each(['<script>alert(1)</script>', '<iframe src="/admin"></iframe>', '<img src="x" onerror="alert(1)" />', '<a href="javascript:alert(1)">Go</a>', '<a href="http://example.test">Go</a>', '<p onclick="alert(1)">Hi</p>', '<p style="color:red">Hi</p>', '<barber-booking tenant="other" />', '<barber-prices layout="fake" />', '<barber-booking><p>Fake receipt</p></barber-booking>', '<p id="same"></p><p id="same"></p>', '<p><strong>broken</p>', '<p class=x>text</p>', '<p><', '<!doctype html>'])('rejects HTML outside the presentation contract: %s', html => {
    expect(() => parseSiteHtml(html)).toThrow();
  });
  it.each(['@import "https://example.test/track";', '.x{background:url(https://example.test)}', '.x{background:URL(/api/private)}', '.x{background:u/**/rl(/private)}', '.x{color:expression(alert(1))}', '.x{--image:url(/private)}', '.x{background:u\\72l(/private)}', '</style><script>alert(1)</script>', '@font-face{font-family:test;src:url(/private)}'])('rejects CSS execution and resource loading: %s', css => {
    expect(() => validateSiteCss(css)).toThrow();
  });
  it('bounds complexity and validates disabled code before persistence', () => {
    expect(() => parseSiteHtml('<div>'.repeat(30) + '</div>'.repeat(30))).toThrow();
    expect(() => parseSiteHtml('<br>'.repeat(501))).toThrow();
    expect(() => parseSiteHtml('x'.repeat(30001))).toThrow();
    expect(siteCodeSchema.safeParse({ enabled: false, html: '<script />', css: '' }).success).toBe(false);
  });
});
