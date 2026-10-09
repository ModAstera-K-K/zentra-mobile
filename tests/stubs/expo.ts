export class NativeModule {}

/** No native module in tests: the wrappers fall back as they do on an unsupported platform. */
export function requireOptionalNativeModule(_name: string): null {
  return null;
}
