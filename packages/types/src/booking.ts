import type { CatalogLocation, CatalogService } from './catalog';

export interface BookingLocation extends CatalogLocation { timezone: string; version: number }
export interface WeeklyWindow { weekday: number; startMinute: number; endMinute: number }
export interface BookingProfessional { id: string; locationId: string; name: string; active: boolean; serviceIds: string[] }
export interface BookingOptions { locations: BookingLocation[]; professionals: BookingProfessional[]; services: CatalogService[] }
export interface CustomerView { id: string; name: string; phone: string; email: string | null; notes: string | null; version: number; whatsappOptInAt: string | null }
export interface CustomerFields { name: string; phone: string; email: string | null; notes: string | null; whatsappOptIn?: boolean }
export interface TimeOffView { id: string; professionalId: string | null; startsAt: string; endsAt: string; reason: string | null }
export interface ScheduleView {
  location: BookingLocation;
  businessHours: WeeklyWindow[];
  professionals: { id: string; name: string; active: boolean; windows: WeeklyWindow[] }[];
  timeOffs: TimeOffView[];
}
export interface UpdateScheduleInput {
  locationId: string;
  expectedVersion: number;
  businessHours: WeeklyWindow[];
  professionals: { professionalId: string; windows: WeeklyWindow[] }[];
}
export interface AvailabilityQuery { locationId: string; professionalId: string; date: string; serviceIds: string; appointmentId?: string }
export interface AvailabilityView { timezone: string; durationMinutes: number; totalCents: number; slots: { startsAt: string; endsAt: string }[] }
export type AppointmentStatusView = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';
export interface AppointmentView {
  id: string; locationId: string; professionalId: string; professionalName: string;
  customer: { id: string; name: string; phone: string };
  status: AppointmentStatusView; startsAt: string; endsAt: string; totalCents: number;
  notes: string | null; version: number;
  services: { serviceId: string; name: string; durationMinutes: number; priceCents: number }[];
}
export interface AppointmentDay { date: string; timezone: string; items: AppointmentView[] }
export interface CreateAppointmentInput {
  locationId: string; professionalId: string; customerId: string; serviceIds: string[];
  startsAt: string; notes: string | null; idempotencyKey: string;
}
