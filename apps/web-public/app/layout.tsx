import { platformName } from '@platform/config';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@platform/web-kit/styles.css';
export const metadata: Metadata = { title: platformName(), description: 'Presença digital e operação para barbearias.',  };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="pt-BR"><body>{children}</body></html>; }


