import { z } from 'zod';
import { designTokenOverridesSchema } from '@platform/design-system';
import { parseSiteHtml, validateSiteCss } from './site-code';
import { siteAssetSchema } from './site-assets';

/** Bounded embedded raster images. No external URL, SVG, document or executable content. */
export const siteImageSchema = z.object({
  src: z.string().max(80000).refine(value => {
    try {
      const match = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
      if (!match || match[2]!.length % 4) return false;
      const bytes = atob(match[2]!);
      if (match[1] === 'webp') return bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
      if (match[1] === 'png') return bytes.startsWith('\x89PNG\r\n\x1a\n');
      return bytes.startsWith('\xff\xd8\xff');
    } catch { return false; }
  }, 'Envie uma imagem pelo editor. Apenas imagens raster compactadas são aceitas.'),
  alt: z.string().trim().min(1, 'Descreva a imagem para quem usa leitor de tela.').max(180),
  position: z.enum(['center', 'top', 'bottom']).optional(),
}).strict();
export const siteAppearanceSchema = z.object({
  width: z.enum(['narrow', 'standard', 'wide']).optional(),
  navigation: z.enum(['inline', 'centered', 'minimal']).optional(),
  headingScale: z.enum(['restrained', 'expressive', 'dramatic']).optional(),
  headingCase: z.enum(['natural', 'uppercase']).optional(),
  imageShape: z.enum(['rectangle', 'arch', 'organic']).optional(),
  separators: z.enum(['none', 'line']).optional(),
}).strict();

export const siteContentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  heroTitle: z.string().trim().min(1).max(160),
  heroSubtitle: z.string().trim().max(600),
  heroLayout: z.enum(['split', 'centered', 'compact', 'poster', 'editorial', 'fullscreen', 'diagonal']).optional(),
  appearance: siteAppearanceSchema.optional(),
  logo: siteImageSchema.optional(),
  heroImage: siteImageSchema.optional(),
  heroEyebrow: z.string().trim().max(80).optional(),
  tagline: z.string().trim().max(100).optional(),
  footerNote: z.string().trim().max(180).optional(),
  ctaLabel: z.string().trim().min(1).max(60).optional(),
  socialLinks: z.array(z.object({
    type: z.enum(['instagram', 'whatsapp', 'facebook', 'google']),
    url: z.string().trim().max(300).url(),
  }).strict()).max(6).optional(),
  sections: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    type: z.enum(['text', 'services', 'team', 'contact', 'booking', 'gallery', 'testimonials', 'faq', 'hours', 'stats', 'cta', 'map']),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().max(3000),
    visible: z.boolean(),
    layout: z.enum(['cards', 'table', 'list']).optional(),
    tone: z.enum(['default', 'surface', 'accent']).optional(),
    align: z.enum(['left', 'center']).optional(),
    eyebrow: z.string().trim().max(80).optional(),
    composition: z.enum(['stacked', 'split']).optional(),
    spacing: z.enum(['compact', 'comfortable', 'generous']).optional(),
    image: siteImageSchema.optional(),
    gallery: z.array(siteImageSchema).max(8).optional(),
    testimonials: z.array(z.object({
      author: z.string().trim().min(1).max(80),
      text: z.string().trim().min(1).max(500),
      rating: z.number().int().min(1).max(5).optional(),
    }).strict()).max(8).optional(),
    faqItems: z.array(z.object({
      question: z.string().trim().min(1).max(200),
      answer: z.string().trim().min(1).max(1000),
    }).strict()).max(12).optional(),
    hours: z.array(z.object({
      day: z.string().trim().min(1).max(20),
      open: z.string().regex(/^\d{2}:\d{2}$/),
      close: z.string().regex(/^\d{2}:\d{2}$/),
    }).strict()).max(7).optional(),
    stats: z.array(z.object({
      value: z.string().trim().min(1).max(20),
      label: z.string().trim().min(1).max(80),
    }).strict()).max(6).optional(),
    ctaUrl: z.string().trim().max(300).optional(),
    mapUrl: z.string().trim().max(500).refine(v => !v || v.startsWith('https://www.google.com/maps/embed'), 'URL de mapa inválida.').optional(),
  }).strict()).max(12).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Seções repetidas.'),
}).strict();
export const siteCodeSchema = z.object({ enabled: z.boolean(), html: z.string().max(30000), css: z.string().max(20000), assets: z.array(siteAssetSchema).max(10).refine(items => new Set(items.map(item => item.name)).size === items.length, 'Nomes de arquivos repetidos.').optional() }).strict().superRefine((value, context) => { try { parseSiteHtml(value.html, value.assets); validateSiteCss(value.css); } catch (error) { context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Código inválido.' }); } });
export const siteEditorConfigSchema = z.object({ tokens: designTokenOverridesSchema, content: siteContentSchema, code: siteCodeSchema.optional() }).strict().refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 900000, 'O site excedeu o limite de imagens. Remova algumas fotos antes de salvar.');
export type SiteContent = z.infer<typeof siteContentSchema>;
export type SiteEditorConfig = z.infer<typeof siteEditorConfigSchema>;
