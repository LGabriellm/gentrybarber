import postcss from 'postcss';
import { validRaster, siteAssetName } from './site-assets';

export interface SiteCodeNode { tag: string; attrs: Record<string, string>; children: (SiteCodeNode | string)[] }
const tags = new Set('main header footer nav section article aside div span p h1 h2 h3 h4 h5 h6 strong em small blockquote ul ol li a br hr img figure figcaption table caption thead tbody tfoot tr th td dl dt dd details summary time mark pre code barber-hero barber-prices barber-team barber-contact barber-booking barber-logo barber-cover barber-gallery barber-hours barber-faq barber-stats barber-testimonials barber-cta barber-map barber-social barber-whatsapp'.split(' '));
const decode = (text: string) => text.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' })[entity]!);
/** Deliberately bounded HTML grammar, interpreted as React nodes rather than inserted/executed. */
export function parseSiteHtml(html: string, assets: readonly { name: string; src: string }[] = []): (SiteCodeNode | string)[] {
  if (html.length > 30000) throw new Error('HTML excede 30.000 caracteres.');
  const root: SiteCodeNode = { tag: 'root', attrs: {}, children: [] }; const stack = [root]; const ids = new Set<string>(); let cursor = 0; let nodes = 0;
  const pattern = /<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+/gi;
  for (const match of html.matchAll(pattern)) {
    if (match.index !== cursor) throw new Error('HTML inválido. Use tags fechadas e atributos entre aspas.');
    cursor += match[0].length; if (++nodes > 500) throw new Error('Limite de 500 elementos de conteúdo.');
    const value = match[0]; if (value.startsWith('<!--')) continue;
    if (!value.startsWith('<')) { stack.at(-1)!.children.push(decode(value)); continue; }
    if (value.startsWith('</')) { const closing = /^<\/([a-z][a-z0-9-]*)\s*>$/i.exec(value); if (!closing || stack.length === 1 || stack.at(-1)!.tag !== closing[1]!.toLowerCase()) throw new Error('Fechamento de tag incompatível.'); stack.pop(); continue; }
    const opening = /^<([a-z][a-z0-9-]*)([\s\S]*?)(\/?)>$/i.exec(value); if (!opening) throw new Error('Tag inválida.');
    const tag = opening[1]!.toLowerCase(); if (!tags.has(tag)) throw new Error(`Tag não permitida: ${tag}.`);
    const attrs: Record<string, string> = {}; let rest = opening[2]!;
    while (rest.trim()) {
      const attr = /^\s+([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(rest);
      if (!attr) throw new Error('Use atributos entre aspas. Eventos e scripts não são aceitos.');
      const key = attr[1]!.toLowerCase(); const val = decode(attr[2] ?? attr[3] ?? '');
      const isDataUri = key === 'src' && val.startsWith('data:');
      if (!['class', 'id', 'title', 'aria-label', 'href', 'layout', 'target', 'rel', 'src', 'alt', 'loading'].includes(key) || key in attrs || val.length > (isDataUri ? 130000 : 300)) throw new Error(`Atributo não permitido ou muito longo: ${key}.`);
      if (key === 'href' && (tag !== 'a' || !/^(#[a-zA-Z][\w-]*|https:\/\/[\w./-]+|tel:\+?\d[\d\s()-]*|mailto:[\w.@+-]+)$/.test(val))) throw new Error('Link inválido. Use #ancora, https://, tel: ou mailto:');
      if (key === 'target' && (tag !== 'a' || val !== '_blank')) throw new Error('Atributo target deve ser _blank e apenas em links.');
      if (key === 'rel' && (tag !== 'a' || val !== 'noopener noreferrer')) throw new Error('Atributo rel deve ser noopener noreferrer e apenas em links.');
      if (key === 'src' && (tag !== 'img' || !(validRaster(val) || val.startsWith('assets/') && siteAssetName.test(val.slice(7)) && assets.some(asset => asset.name === val.slice(7))))) throw new Error('Imagem inválida. Use assets/nome.png ou imagem raster válida.');
      if (key === 'alt' && tag !== 'img') throw new Error('Atributo alt é apenas para imagens.');
      if (key === 'loading' && (tag !== 'img' || val !== 'lazy')) throw new Error('Imagens devem usar loading="lazy".');
      if (key === 'layout' && (tag !== 'barber-prices' || !['cards', 'table', 'list'].includes(val))) throw new Error('Layout de preços inválido.');
      if ((key === 'class' || key === 'id') && !/^[a-zA-Z][a-zA-Z0-9_ -]*$/.test(val)) throw new Error('Classe ou identificador inválido.');
      if (key === 'id') { if (ids.has(val) || val.includes(' ')) throw new Error('Use identificadores únicos sem espaços.'); ids.add(val); }
      attrs[key] = val; rest = rest.slice(attr[0].length);
    }
    if (tag === 'img' && (!attrs.src || !attrs.alt || !attrs.loading)) throw new Error('Tags <img> exigem src (base64), alt (texto alternativo) e loading="lazy".');
    const node: SiteCodeNode = { tag, attrs, children: [] }; stack.at(-1)!.children.push(node);
    if (!opening[3] && !['br', 'hr', 'img'].includes(tag)) { stack.push(node); if (stack.length > 24) throw new Error('HTML muito profundo.'); }
  }
  if (cursor !== html.length || stack.length !== 1) throw new Error('HTML incompleto. Confira as tags.');
  function validate(nodes: (SiteCodeNode | string)[]) { for (const node of nodes) if (typeof node !== 'string') { if (node.tag.startsWith('barber-') && node.children.some(child => typeof child !== 'string' || child.trim())) throw new Error('Componentes barber-* não aceitam conteúdo interno.'); validate(node.children); } }
  validate(root.children); return root.children;
}

export function validateSiteCss(css: string): string {
  if (css.length > 20000 || /[<>\\]/.test(css)) throw new Error('CSS inválido ou maior que 20.000 caracteres.');
  const root = postcss.parse(css);
  root.walkAtRules(rule => { 
    if (rule.name.toLowerCase() === 'media') {
       if (!/^[a-zA-Z0-9\s():.,/%-]+$/.test(rule.params)) throw new Error('Parâmetro @media inválido.');
    } else if (rule.name.toLowerCase() === 'keyframes') {
       if (!/^[a-zA-Z0-9_-]+$/.test(rule.params)) throw new Error('Nome de @keyframes inválido.');
    } else {
       throw new Error('Somente @media e @keyframes são permitidos.'); 
    }
  });
  const properties = new Set('display position top right bottom left z-index width min-width max-width height min-height max-height margin margin-top margin-bottom margin-left margin-right padding padding-top padding-bottom padding-left padding-right gap row-gap column-gap grid-template-columns grid-template-rows grid-column grid-row grid-auto-flow align-items align-content justify-content justify-items flex flex-direction flex-wrap flex-grow flex-shrink flex-basis order color background background-color background-image border border-top border-bottom border-left border-right border-color border-width border-style border-radius box-shadow font font-family font-size font-weight font-style line-height letter-spacing text-align text-transform text-decoration white-space overflow overflow-x overflow-y overflow-wrap word-break opacity box-sizing list-style list-style-type cursor transform transform-origin aspect-ratio transition transition-property transition-duration transition-timing-function transition-delay animation animation-name animation-duration animation-timing-function animation-delay animation-fill-mode animation-iteration-count filter backdrop-filter clip-path object-fit object-position text-shadow columns column-gap column-count outline outline-color outline-width outline-offset scroll-behavior scroll-margin-top place-items place-content inset'.split(' '));
  const functions = new Set(['var', 'calc', 'min', 'max', 'clamp', 'rgb', 'rgba', 'hsl', 'hsla', 'linear-gradient', 'radial-gradient', 'repeat', 'minmax', 'fit-content', 'translate', 'translatex', 'translatey', 'scale', 'rotate', 'color-mix', 'conic-gradient', 'oklch', 'oklab', 'polygon', 'circle', 'ellipse', 'inset', 'blur', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'drop-shadow', 'cubic-bezier', 'ease', 'steps']);
  root.walkDecls(decl => { if (!properties.has(decl.prop.toLowerCase()) && !/^--[a-zA-Z][\w-]*$/.test(decl.prop)) throw new Error(`Propriedade CSS não permitida: ${decl.prop}.`); if (!/^[#a-zA-Z0-9\s.,%()/_+*'":-]*$/.test(decl.value)) throw new Error('Valor CSS inválido.'); for (const match of decl.value.matchAll(/([a-zA-Z-]+)\s*\(/g)) if (!functions.has(match[1]!.toLowerCase())) throw new Error(`Função CSS não permitida: ${match[1]}. URLs e scripts não são aceitos.`); });
  return css;
}
export const defaultSiteHtml = `<header class="top">
  <strong>Sua barbearia</strong>
  <nav>
    <a href="#precos">Serviços e preços</a>
    <a href="#agenda">Agendar</a>
    <a href="#contato" class="btn-primary">Contato</a>
  </nav>
</header>
<main>
  <barber-hero />
  <section class="section">
    <span class="eyebrow">FEITO PARA VOCÊ</span>
    <h2>Mais que um corte. Seu momento.</h2>
    <p>Conte a história da barbearia e apresente o que torna o atendimento especial.</p>
  </section>
  <section id="precos" class="section">
    <h2>Serviços e preços</h2>
    <barber-prices layout="cards" />
  </section>
  <section class="section">
    <h2>Estatísticas</h2>
    <barber-stats />
  </section>
  <section id="agenda" class="section">
    <h2>Escolha seu próximo horário</h2>
    <barber-booking />
  </section>
  <section id="contato" class="section">
    <barber-contact />
    <barber-social />
  </section>
</main>`;
export const defaultSiteCss = `body { margin: 0; background: var(--theme-background); color: var(--theme-text); font-family: var(--theme-body-font); scroll-behavior: smooth; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 24px; border-bottom: 1px solid #d6dfd2; }
a { color: inherit; text-decoration: none; transition: opacity 0.2s ease; }
a:hover { opacity: 0.7; }
.btn-primary { background: var(--theme-primary); color: var(--theme-surface); padding: 8px 16px; border-radius: var(--theme-radius-button); }
.btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
.section { max-width: 1120px; margin: 0 auto; padding: 64px 24px; scroll-margin-top: 80px; }
h2 { font-size: clamp(28px, 4vw, 48px); line-height: 1.15; }
.eyebrow { letter-spacing: 3px; font-size: 12px; }
@media (max-width: 600px) { .top { flex-direction: column; } .section { padding: 40px 20px; } }`;
