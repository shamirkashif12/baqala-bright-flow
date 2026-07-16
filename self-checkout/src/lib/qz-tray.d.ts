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
    usb: {
      listDevices(includeHubs: boolean): Promise<Array<{ vendorId: string; productId: string; hub: boolean; manufacturer?: string; product?: string }>>;
      listInterfaces(info: { vendorId: string; productId: string }): Promise<string[]>;
      listEndpoints(info: { vendorId: string; productId: string; interface: string }): Promise<string[]>;
      claimDevice(info: { vendorId: string; productId: string; interface: string }): Promise<void>;
      releaseDevice(info: { vendorId: string; productId: string }): Promise<void>;
      isClaimed(info: { vendorId: string; productId: string }): Promise<boolean>;
      sendData(info: { vendorId: string; productId: string; endpoint: string; data: string | { data: string; type: "PLAIN" | "HEX" | "BASE64" | "FILE" } }): Promise<void>;
    };
    security: {
      setCertificatePromise(cb: (resolve: (cert: string | null) => void, reject: (err: unknown) => void) => void): void;
      setSignaturePromise(cb: (toSign: string) => (resolve: (sig: string | null) => void, reject: (err: unknown) => void) => void): void;
    };
  }

  const qz: QZ;
  export default qz;
}
