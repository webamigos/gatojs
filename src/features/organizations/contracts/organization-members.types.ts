export interface OrganizationMemberRow {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
}

export interface OrganizationInvitationRow {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string | null;
}
