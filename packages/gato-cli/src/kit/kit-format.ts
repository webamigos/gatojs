export const SUPPORTED_KIT_FORMATS: readonly number[] = [1, 2, 3];

export function assertSupportedKitFormat(format: number): void {
  if (!SUPPORTED_KIT_FORMATS.includes(format)) {
    throw new Error(
      `This project uses kit format ${format}; update gato-cli (npm i -D gato-cli@latest) or run: npx gato-cli@latest update <version>`,
    );
  }
}
