export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  membershipRole:
    | 'agency_owner'
    | 'agency_admin'
    | 'manager'
    | 'analyst'
    | 'client_viewer';
  allowedClientIds: string[];
}
