export interface CatalogLocation {
  id: string;
  name: string;
  active: boolean;
}

export interface CatalogService {
  id: string;
  locationId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  version: number;
}

export interface CatalogProfessional {
  id: string;
  locationId: string;
  userId: string | null;
  name: string;
  bio: string | null;
  active: boolean;
  serviceIds: string[];
  version: number;
}

export interface ServiceCatalog {
  items: CatalogService[];
  locations: CatalogLocation[];
}

export interface ProfessionalCatalog {
  items: CatalogProfessional[];
  locations: CatalogLocation[];
  services: Pick<CatalogService, 'id' | 'locationId' | 'name' | 'active'>[];
}

export interface ServiceFields {
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
}

export interface ProfessionalFields {
  name: string;
  bio: string | null;
  active: boolean;
  serviceIds: string[];
  userId?: string;
}

export type CreateServiceInput = ServiceFields & { locationId: string };
export type UpdateServiceInput = ServiceFields & { expectedVersion: number };
export type CreateProfessionalInput = ProfessionalFields & { locationId: string };
export type UpdateProfessionalInput = ProfessionalFields & { expectedVersion: number };
