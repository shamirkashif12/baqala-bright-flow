declare module "qz-tray" {
  interface QZConfig {
    [key: string]: unknown;
  }

  interface PrintData {
    type: "raw" | "pixel" | "html";
    format: "command" | "base64" | "file" | "plain";
    data: number[] | string | Uint8Array;
    options?: Record<string, unknown>;
  }

  interface QZ {
    websocket: {
      connect(options?: { retries?: number; delay?: number; host?: string; port?: { secure: number[]; insecure: number[] } }): Promise<void>;
      disconnect(): Promise<void>;
      isActive(): boolean;
    };
    printers: {
      find(query?: string): Promise<string | string[]>;
      getDefault(): Promise<string>;
    };
    configs: {
      create(printer: string, options?: Record<string, unknown>): QZConfig;
    };
    print(config: QZConfig, data: PrintData[]): Promise<void>;
    security: {
      setCertificatePromise(cb: (resolve: (cert: string | null) => void, reject: (err: unknown) => void) => void): void;
      setSignaturePromise(cb: (toSign: string) => (resolve: (sig: string | null) => void, reject: (err: unknown) => void) => void): void;
    };
  }

  const qz: QZ;
  export default qz;
}
