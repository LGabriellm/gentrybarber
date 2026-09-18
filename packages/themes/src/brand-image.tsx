'use client';
import { useState } from 'react';
import { siteImageSchema, type SiteContent } from '@platform/theme-engine';

export function BrandImage({ image, eager = false, logo = false }: { image: NonNullable<SiteContent['heroImage']>; eager?: boolean; logo?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const valid = siteImageSchema.safeParse(image);
  if (!valid.success || failed === image.src) return <span className="brand-image-fallback" role="img" aria-label={image.alt || 'Imagem da barbearia'}>{image.alt || 'Adicione uma imagem da sua marca'}</span>;
  return <img className={logo ? 'brand-logo' : 'brand-image'} src={image.src} alt={image.alt} width={logo ? 240 : 1200} height={logo ? 100 : 1000} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" style={{ objectPosition: image.position ?? 'center' }} onError={() => setFailed(image.src)} />;
}
