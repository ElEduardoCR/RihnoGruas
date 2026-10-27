export interface ResearchSource {
  id: string;
  title: string;
  url: string;
  scope: "model" | "family" | "identification";
}

export interface MaintenancePlan {
  id: string;
  title: string;
  description: string;
  tasks: string[];
  cadence: string;
  interval_hours: number | null;
  interval_km: number | null;
  interval_months: number | null;
  basis: "manufacturer_family" | "preliminary";
  source_ids: string[];
  checklist_steps?: MaintenanceChecklistStep[];
  checklist_version?: string;
}

export interface MaintenanceChecklistStep {
  id: string;
  section: string;
  title: string;
  instructions: string;
  procedure_steps: string[];
  response_type: "ok_falla" | "texto" | "numero";
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  min_photos: number;
  photo_requirements: string[];
  photo_hint: string;
  critical: boolean;
  source_ids: string[];
  reference_locator: string;
  requires_manual_confirmation: boolean;
}

export interface ReferencePhoto {
  src: string;
  alt: string;
  source_url: string;
  author: string;
  license: string;
  license_url: string;
  match: "model" | "family";
}

/** Research is kept separate from the unit's verified operating specifications. */
export interface FleetProfile {
  import_key: string;
  reported_by: string;
  reported_on: string;
  economic_number: string | null;
  provisional_code: boolean;
  reported_capacity: string | null;
  reported_reach: string | null;
  identification_status: "model_reported" | "model_pending";
  characteristics: string[];
  pending: string[];
  sources: ResearchSource[];
  maintenance_plans: MaintenancePlan[];
  photo: ReferencePhoto | null;
}
