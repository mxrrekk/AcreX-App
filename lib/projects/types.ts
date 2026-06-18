import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";

export type ZoneType = "Property" | "Grass" | "Brush" | "Woods" | "Fence" | "Driveway" | "HousePad" | "Building" | "Excluded" | "Custom";
export type ShapeGeometryType = "polygon" | "line" | "circle";
export type QuoteRateType = "per_acre" | "per_sq_ft" | "per_linear_ft" | "each";
export type ProjectStatus = "Draft" | "Estimating" | "Quoted" | "Won" | "Lost" | "Completed" | "Archived";
export type QuoteStatus = "Draft" | "Sent" | "Accepted" | "Declined";
export type InvoiceStatus = "Draft" | "Sent" | "Paid" | "Overdue";
export type QuoteService =
  | "Mowing"
  | "Brush Clearing"
  | "Forestry Mulching / Brush Clearing"
  | "Forestry Mulching"
  | "Land Clearing"
  | "Driveway Prep"
  | "Gravel Driveway"
  | "House Pad"
  | "House Pad Prep"
  | "Fencing"
  | "Fence Installation"
  | "Sod"
  | "Irrigation"
  | "Non-billable"
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
  serviceTypeId?: string;
  serviceType?: string;
  serviceTypeLabel?: string;
  geometryType?: ShapeGeometryType;
  color?: string;
  unit?: "acre" | "sq ft" | "linear ft" | "each";
  areaAcres?: number;
  areaSqFt?: number;
  lengthFt?: number;
  label?: string;
  quoteCategory?: QuoteService | string;
  defaultRateType?: QuoteRateType;
  visible?: boolean;
  createdAt?: string;
  feature: Feature<Polygon | LineString, SavedZoneProperties>;
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
  shapeType?: ShapeGeometryType;
  radiusFeet?: number;
  circumferenceFeet?: number;
  serviceTypeId?: string;
  serviceType?: string;
  serviceTypeLabel?: string;
  geometryType?: ShapeGeometryType;
  color?: string;
  unit?: "acre" | "sq ft" | "linear ft" | "each";
  areaAcres?: number;
  areaSqFt?: number;
  lengthFt?: number;
  label?: string;
  quoteCategory?: QuoteService | string;
  defaultRateType?: QuoteRateType;
  visible?: boolean;
  createdAt?: string;
  serviceTypeChangedAt?: string;
  previousServiceTypeLabel?: string;
  previousQuoteCategory?: string;
};

export type SavedProjectMapData =
  | Feature<Polygon | LineString, SavedZoneProperties>
  | (FeatureCollection<Polygon | LineString, SavedZoneProperties> & {
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
  discount: string;
  taxPercent: string;
  depositPercent: string;
  depositAmount: string;
  depositMode: "percent" | "amount";
  scopeOfWork: string;
  customerNotes: string;
  exclusions: string;
  paymentTerms: string;
  estimatedTimeline: string;
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
