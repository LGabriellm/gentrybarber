'use client';

import { useState } from 'react';
import { DashboardIcon } from './dashboard-navigation';

interface Action { href: string; title: string; description: string; mark: string }
export function DashboardDirectory({ routine, configuration }: { routine: Action[]; configuration: Action[] }) {
  const [query, setQuery] = useState('');
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const match = (item: Action) => normalize(`${item.title} ${item.description}`).includes(normalize(query.trim()));
  const sections = [
    { id: 'daily-title', title: 'Seu dia a dia', items: routine.filter(match) },
    { id: 'settings-title', title: 'Configure sua barbearia', items: configuration.filter(match) },
  ];
  const count = sections.reduce((total, section) => total + section.items.length, 0);
  return <>
    <div className="dashboard-search"><label htmlFor="dashboard-search">O que você precisa fazer?</label><div><input id="dashboard-search" type="search" placeholder="Buscar agenda, serviços, horários…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" onClick={() => setQuery('')}>Limpar</button>}</div></div>
    {query && <p className="dashboard-search-result" role="status">{count ? `${count} atalhos encontrados` : 'Nenhum atalho encontrado. Tente outro termo.'}</p>}
    {sections.map(section => <section key={section.id} className="dashboard-section" aria-labelledby={section.id}><div className="dashboard-section-heading"><h2 id={section.id}>{section.title}</h2></div><div className="dashboard-action-grid">{section.items.map(item => <a className="dashboard-action" key={item.href} href={item.href}><span className="dashboard-action-mark"><DashboardIcon name={item.mark === '01' ? 'calendar' : item.mark === '02' || item.mark === 'P' ? 'people' : 'settings'} /></span><div><h3>{item.title}</h3><p>{item.description}</p></div><span className="dashboard-action-arrow" aria-hidden="true">›</span></a>)}</div></section>)}
  </>;
}
