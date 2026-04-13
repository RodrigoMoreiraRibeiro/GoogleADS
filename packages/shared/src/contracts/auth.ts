export interface AuthenticatedUser {
  id: string;
  email: string;
  platformRole: 'none' | 'superadmin';
}

export interface SessionContext {
  userId: string;
  tenantId?: string;
  clientIds: string[];
  mfaVerified: boolean;
}
