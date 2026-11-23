import "server-only";

export class OrganizationDataKeyMissingError extends Error {
  name = "OrganizationDataKeyMissingError";
}

export async function encryptForOrganization(
  organizationId: string,
  plaintext: string,
): Promise<string> {
  throw new Error(`not implemented ${organizationId} ${plaintext.length}`);
}

export async function decryptForOrganization(
  organizationId: string,
  ciphertext: string,
): Promise<string> {
  throw new Error(`not implemented ${organizationId} ${ciphertext.length}`);
}
