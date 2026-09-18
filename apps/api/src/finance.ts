import type { PrismaClient } from '@platform/database';
import type { FinanceSummaryView } from '@platform/types';

export class FinanceService {
  constructor(private readonly db: PrismaClient) {}

  async getSummary(tenantId: string, locationId: string | undefined, timezone: string): Promise<FinanceSummaryView> {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const todayStr = formatter.format(now);
    const [month, day, year] = todayStr.split('/');
    const currentMonthPrefix = `${year}-${month}`; // e.g. "2023-10"
    const todayPrefix = `${year}-${month}-${day}`; // e.g. "2023-10-15"

    // Encontra o exato primeiro milissegundo do mês no fuso horário local via busca binária
    let min = now.getTime() - 32 * 24 * 60 * 60 * 1000;
    let max = now.getTime();
    while (max - min > 1000) {
      const mid = Math.floor((min + max) / 2);
      const [mMonth, , mYear] = formatter.format(new Date(mid)).split('/');
      if (`${mYear}-${mMonth}` === currentMonthPrefix) max = mid;
      else min = mid;
    }
    const startOfMonth = new Date(max);

    // O banco de dados trará exata e apenas os dados úteis do mês atual
    const appointments = await this.db.appointment.findMany({
      where: {
        tenantId,
        ...(locationId ? { locationId } : {}),
        status: 'COMPLETED',
        startsAt: { gte: startOfMonth }
      },
      include: {
        professional: { select: { id: true, name: true } },
        services: { select: { serviceId: true, name: true, priceCents: true } }
      }
    });

    let todayTotalCents = 0;
    let monthTotalCents = 0;
    let todayCount = 0;
    let monthCount = 0;

    const profMap = new Map<string, { name: string; totalCents: number }>();
    const serviceMap = new Map<string, { name: string; count: number; totalCents: number }>();

    for (const appt of appointments) {
      const apptDateStr = formatter.format(appt.startsAt);
      const [aMonth, aDay, aYear] = apptDateStr.split('/');
      const apptMonthPrefix = `${aYear}-${aMonth}`;
      const apptDayPrefix = `${aYear}-${aMonth}-${aDay}`;

      if (apptMonthPrefix !== currentMonthPrefix) continue; // Skip if not current month in local timezone

      monthTotalCents += appt.totalCents;
      monthCount++;

      if (apptDayPrefix === todayPrefix) {
        todayTotalCents += appt.totalCents;
        todayCount++;
      }

      // Group by professional
      const prof = profMap.get(appt.professionalId) || { name: appt.professional.name, totalCents: 0 };
      prof.totalCents += appt.totalCents;
      profMap.set(appt.professionalId, prof);

      // Group by service
      for (const s of appt.services) {
        const srv = serviceMap.get(s.serviceId) || { name: s.name, count: 0, totalCents: 0 };
        srv.count++;
        srv.totalCents += s.priceCents;
        serviceMap.set(s.serviceId, srv);
      }
    }

    const professionalsRevenue = Array.from(profMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.totalCents - a.totalCents);

    const topServices = Array.from(serviceMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      todayTotalCents,
      monthTotalCents,
      todayAppointments: todayCount,
      monthAppointments: monthCount,
      professionalsRevenue,
      topServices,
    };
  }
}
