import type { OrgContext } from "@/shared/lib/auth/org-context";

export interface UploadResponse {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export type ApiOrgContextResult =
  { ok: true; context: OrgContext } | { ok: false; status: 401 | 403 };

export type CreateUploadResult =
  | { status: 201; body: UploadResponse }
  | {
      status: 400 | 401 | 403 | 404 | 413 | 415 | 500;
      body: { error: string };
    };
