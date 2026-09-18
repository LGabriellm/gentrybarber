'use client';

import { formatPrice } from '../lib/catalog-format';
import type { FinanceSummaryView } from '@platform/types';
import './finance.css';

export function FinanceManager({ summary, timezone }: { summary: FinanceSummaryView; timezone: string }) {
  return (
    <div className="finance-dashboard">
      <div className="finance-summary-cards">
        <div className="finance-card">
          <span className="finance-card-title">Faturamento Hoje</span>
          <p className="finance-card-value">{formatPrice(summary.todayTotalCents)}</p>
          <span className="finance-card-sub">{summary.todayAppointments} {summary.todayAppointments === 1 ? 'atendimento' : 'atendimentos'} concluídos</span>
        </div>
        <div className="finance-card">
          <span className="finance-card-title">Faturamento do Mês</span>
          <p className="finance-card-value">{formatPrice(summary.monthTotalCents)}</p>
          <span className="finance-card-sub">{summary.monthAppointments} {summary.monthAppointments === 1 ? 'atendimento' : 'atendimentos'} no período</span>
        </div>
      </div>

      <div className="finance-details">
        <section className="finance-panel">
          <h2>Faturamento por Profissional (Mês)</h2>
          {summary.professionalsRevenue.length > 0 ? (
            <ul className="finance-list">
              {summary.professionalsRevenue.map(prof => (
                <li key={prof.id}>
                  <div>
                    <span className="finance-item-name">{prof.name}</span>
                  </div>
                  <span className="finance-item-value">{formatPrice(prof.totalCents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="catalog-empty" style={{ margin: 0, padding: '20px 0', border: 'none' }}>Nenhum atendimento concluído no mês.</p>
          )}
        </section>

        <section className="finance-panel">
          <h2>Serviços Mais Realizados (Mês)</h2>
          {summary.topServices.length > 0 ? (
            <ul className="finance-list">
              {summary.topServices.map(service => (
                <li key={service.id}>
                  <div>
                    <span className="finance-item-name">{service.name}</span>
                    <span className="finance-item-meta">{service.count} {service.count === 1 ? 'vez' : 'vezes'}</span>
                  </div>
                  <span className="finance-item-value">{formatPrice(service.totalCents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="catalog-empty" style={{ margin: 0, padding: '20px 0', border: 'none' }}>Nenhum serviço realizado no mês.</p>
          )}
        </section>
      </div>
      <p className="notice" style={{ marginTop: '0' }}>
        * O faturamento considera apenas atendimentos com o status <strong>Concluído</strong> de acordo com a data de início registrada na agenda local ({timezone}).
      </p>
    </div>
  );
}
