import { z } from 'zod';

export const siteAssetName = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.(png|jpg|jpeg|webp)$/;
export function validRaster(value: string): boolean {
  try {
    const match = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2]!.length % 4 || value.length > 80000) return false;
    const bytes = atob(match[2]!);
    if (match[1] === 'webp') return bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    if (match[1] === 'png') return bytes.startsWith('\x89PNG\r\n\x1a\n');
    return bytes.startsWith('\xff\xd8\xff');
  } catch { return false; }
}
export const siteAssetSchema = z.object({ name: z.string().regex(siteAssetName), src: z.string().max(80000).refine(validRaster, 'Imagem inválida; use PNG, JPEG ou WebP até 58 KiB.') }).strict().refine(asset => {
  const ext = asset.name.split('.').at(-1);
  return asset.src.startsWith(`data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,`);
}, 'A extensão não corresponde ao conteúdo da imagem.');

/** Reviewed utility library. Custom CSS is loaded afterwards and can override every rule. */
export const studioUtilities = `.container{width:100%;max-width:1200px;margin-left:auto;margin-right:auto;padding-left:24px;padding-right:24px}.flex{display:flex}.grid{display:grid}.block{display:block}.hidden{display:none}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}.justify-between{justify-content:space-between}.justify-center{justify-content:center}.gap-2{gap:8px}.gap-4{gap:16px}.gap-8{gap:32px}.p-4{padding:16px}.p-8{padding:32px}.py-16{padding-top:64px;padding-bottom:64px}.mx-auto{margin-left:auto;margin-right:auto}.w-full{width:100%}.text-center{text-align:center}.text-sm{font-size:14px}.text-xl{font-size:24px}.font-bold{font-weight:700}.uppercase{text-transform:uppercase}.rounded{border-radius:12px}.rounded-full{border-radius:999px}.overflow-hidden{overflow:hidden}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}@media(max-width:640px){.grid-cols-2,.grid-cols-3{grid-template-columns:1fr}.flex-wrap-mobile{flex-wrap:wrap}}`;
export const studioComponents = [
  ['barber-hero', 'Capa', '.code-hero'], ['barber-logo', 'Marca', '.brand-logo'],
  ['barber-cover', 'Fotografia de capa', '.brand-image'], ['barber-prices', 'Serviços e preços', '.site-pricing, .price-card, .price-table'],
  ['barber-team', 'Equipe', '.code-team'], ['barber-booking', 'Agendamento', '.booking-widget'],
  ['barber-contact', 'Contato', 'address'], ['barber-map', 'Localização', '.location-map'],
  ['barber-gallery', 'Galeria', '.code-gallery'], ['barber-hours', 'Horários', '.ds-business-hours'],
  ['barber-faq', 'Perguntas frequentes', '.ds-faq-list'], ['barber-testimonials', 'Depoimentos', '.ds-testimonials-grid'],
  ['barber-stats', 'Destaques', '.ds-stats-block'], ['barber-cta', 'Chamada', '.ds-cta-banner'], ['barber-social', 'Redes sociais', '.ds-social-links'],
  ['barber-whatsapp', 'Botão do WhatsApp', '.whatsapp-float'],
] as const;
