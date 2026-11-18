/** Outcome of checking a file for malware. */
export type ScanResult = "clean" | "infected" | "not_scanned";

/** A malware scanner. A real one (a hosted or self-run scanner) is pending a provider decision. */
export interface MalwareScanner {
  scan(data: Buffer): Promise<ScanResult>;
}
export const MALWARE_SCANNER = Symbol("MALWARE_SCANNER");

/** Development and tests: no scanning. Files are marked "not_scanned"; production refuses this. */
export class NoScanner implements MalwareScanner {
  async scan(): Promise<ScanResult> {
    return "not_scanned";
  }
}
