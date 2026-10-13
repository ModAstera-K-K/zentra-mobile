// The part of pako 1.x the export uses. The package ships no types.
declare module "pako" {
  export class Deflate {
    constructor(options?: { raw?: boolean; level?: number; chunkSize?: number });
    err: number;
    msg: string;
    onData: (chunk: Uint8Array) => void;
    push(data: Uint8Array, final: boolean): boolean;
  }
  const pako: { Deflate: typeof Deflate };
  export default pako;
}
