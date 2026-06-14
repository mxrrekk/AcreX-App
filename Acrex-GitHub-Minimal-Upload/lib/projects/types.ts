import type { Feature, FeatureCollection, Polygon } from "geojson";

export type ZoneType = "Property" | "Grass" | "Brush" | "Driveway" | "Building" | "Excluded" | "Custom";
export type ProjectStatus = "Draft" | "Estimating" | "Quoted" | "Won" | "Lost" | "Completed" | "Archived";
export type QuoteStatus = "Draft" | "Sent" | "Accepted" | "Declined";
export type InvoiceStatus = "Draft" | "Sent" | "Paid" | "Overdue";
export type QuoteService =
  | "Mowing"
  | "Brush Clearing"
  | "Forestry Mulching"
  | "Land Clearing"
  | "Driveway Prep"
  | "House Pad"
  | "Fencing"
  | "Sod"
  | "Irrigation"
  | "Custom";

export type WorkZone = {
  id: string;
  name: string;
  type: ZoneType;
  acres: number;
  squareFeet: number;
  perimeterFeet: number;
  locked: boolean;
  notes: string;
  feature: Feature<Polygon, SavedZoneProperties>;
};

export type SavedZoneProperties = {
  zoneName?: string;
  zoneType?: ZoneType;
  zoneNotes?: string;
  acres?: number;
  squareFeet?: number;
  perimeterFeet?: number;
  zoneLocked?: boolean;
  zoneVisible?: boolean;
  shapeType?: "polygon" | "circle";
  radiusFeet?: number;
  circumferenceFeet?: number;
};

export type SavedProjectMapData =
  | Feature<Polygon, SavedZoneProperties>
  | (FeatureCollection<Polygon, SavedZoneProperties> & {
      properties?: {
        status?: ProjectStatus;
        address?: string;
        projectName?: string;
      };
    });

export type ProjectRecord = {
  id: string;
  user_id: string;
  client_id: string | null;
  project_name: string;
  customer_name: string | null;
  address: string | null;
  polygon_geojson: SavedProjectMapData | null;
  acres: number | null;
  square_feet: number | null;
  service_type: string | null;
  price_per_acre: number | null;
  estimated_total: number | null;
  created_at: string;
  updated_at: string;
};

export type ProjectFormState = {
  projectName: string;
  customerName: string;
  clientId: string;
  address: string;
  serviceType: string;
  pricePerAcre: string;
  status: ProjectStatus;
};

export type ClientRecord = {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientFormState = {
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

export type QuoteRecord = {
  id: string;
  user_id: string;
  project_id: string | null;
  client_id: string | null;
  quote_number: string;
  status: QuoteStatus;
  project_name: string | null;
  client_name: string | null;
  address: string | null;
  subtotal: number;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteItemRecord = {
  id: string;
  quote_id: string;
  user_id: string;
  service: QuoteService | string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  zone_name: string | null;
  zone_type: ZoneType | string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type QuoteItemFormState = {
  id: string;
  service: QuoteService;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
  zoneName: string;
  zoneType: string;
  notes: string;
};

export type QuoteFormState = {
  projectId: string;
  clientId: string;
  status: QuoteStatus;
  notes: string;
};

export type InvoiceRecord = {
  id: string;
  user_id: string;
  quote_id: string;
  project_id: string | null;
  client_id: string | null;
  invoice_number: string;
  due_date: string | null;
  status: InvoiceStatus;
  client_name: string | null;
  project_name: string | null;
  address: string | null;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceFormState = {
  quoteId: string;
  invoiceNumber: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
};
