export interface ApiKeyRow {
  id: string;
  name: string;
  displayPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdBy: { id: string; name: string } | null;
}
