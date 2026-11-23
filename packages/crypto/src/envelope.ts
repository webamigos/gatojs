export function encryptContent(plaintext: string, dataKey: Buffer): string {
  throw new Error(`not implemented ${plaintext.length} ${dataKey.length}`);
}

export function decryptContent(payload: string, dataKey: Buffer): string {
  throw new Error(`not implemented ${payload.length} ${dataKey.length}`);
}
