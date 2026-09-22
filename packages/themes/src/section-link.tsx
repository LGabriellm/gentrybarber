'use client';

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';

export function focusSection(document: Document, href: string): boolean {
  if (!href.startsWith('#')) return false;
  let id: string;
  try { id = decodeURIComponent(href.slice(1)); } catch { return false; }
  const target = id ? document.getElementById(id) : document.body;
  if (!target) return false;
  const hadTabIndex = target.hasAttribute('tabindex');
  if (!hadTabIndex) target.setAttribute('tabindex', '-1');
  target.focus();
  const view = document.defaultView;
  const behavior = view?.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const frame = view?.frameElement;
  const parentView = frame?.ownerDocument.defaultView;
  if (frame && parentView) {
    const top = parentView.scrollY + frame.getBoundingClientRect().top + target.getBoundingClientRect().top;
    parentView.scrollTo({ top, behavior });
  } else target.scrollIntoView({ block: 'start', behavior });
  document.defaultView?.requestAnimationFrame(() => target.focus());
  if (!hadTabIndex) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
  return true;
}

export function scrollToSection(event: MouseEvent<HTMLAnchorElement>, href: string): boolean {
  if (!focusSection(event.currentTarget.ownerDocument, href)) return false;
  event.preventDefault();
  return true;
}

export function SectionLink({ href, children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) {
  return <a {...props} href={href} onClick={event => { scrollToSection(event, href); onClick?.(event); }}>{children}</a>;
}
