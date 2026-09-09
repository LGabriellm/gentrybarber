export interface LocationAddress {
  street?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface LocationItem {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  timezone: string;
  address: LocationAddress;
  phone: string | null;
  active: boolean;
  version: number;
}

export interface LocationCatalog {
  locations: LocationItem[];
}

export interface LocationFields {
  name: string;
  phone?: string | null;
  address: LocationAddress;
  active: boolean;
}

export type CreateLocationInput = LocationFields & { slug?: string };
export type UpdateLocationInput = LocationFields & { expectedVersion: number };
