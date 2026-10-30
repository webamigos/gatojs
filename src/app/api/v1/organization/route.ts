import { authenticateApiKey } from "@/features/api-keys/services/authenticate-api-key";
import { readOrganizationForApiKey } from "@/features/api-keys/services/organization-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request, "organization:read");
  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }
  return Response.json(await readOrganizationForApiKey(auth.context), {
    headers: NO_STORE,
  });
}
