import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhatsAppFloat } from './shared';

describe('WhatsApp contact button', () => {
  it('uses the configured number and names the destination', () => {
    const html = renderToStaticMarkup(<WhatsAppFloat phone="+55 (11) 98765-4321" />);
    expect(html).toContain('href="https://wa.me/5511987654321"');
    expect(html).toContain('aria-label="Conversar com a barbearia pelo WhatsApp"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it.each([undefined, '', 'abc', '123'])('hides the button without a valid number', phone => {
    expect(renderToStaticMarkup(<WhatsAppFloat phone={phone} />)).toBe('');
  });
});
