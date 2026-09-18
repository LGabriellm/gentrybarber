import { platformName } from '@platform/config';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@platform/web-kit/styles.css';
import '../components/dashboard-mobile.css';
export const metadata: Metadata = { title: platformName(), description: 'Presença digital e operação para barbearias.', robots: { index: false, follow: false }, };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="pt-BR"><body>{children}</body></html>; }


