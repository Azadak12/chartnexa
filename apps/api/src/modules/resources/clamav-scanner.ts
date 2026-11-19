import { ServiceUnavailableException } from "@nestjs/common";
import { createConnection } from "node:net";
import type { MalwareScanner, ScanResult } from "./scanner.js";

const CHUNK = 64 * 1024;

/**
 * Scans with a ClamAV daemon (clamd) over TCP using its INSTREAM command. The daemon runs as a
 * separate private service. Any failure to reach or understand it fails the upload: a file is
 * never accepted as "clean" without an answer.
 */
export class ClamAvScanner implements MalwareScanner {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs: number,
  ) {}

  scan(data: Buffer): Promise<ScanResult> {
    return new Promise<ScanResult>((resolve, reject) => {
      const unavailable = () =>
        new ServiceUnavailableException("Files cannot be checked right now. Try again shortly.");
      const socket = createConnection({ host: this.host, port: this.port });
      let reply = "";
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        socket.destroy();
        fn();
      };
      socket.setTimeout(this.timeoutMs, () => finish(() => reject(unavailable())));
      socket.on("error", () => finish(() => reject(unavailable())));
      socket.on("data", (d) => {
        reply += d.toString("utf8");
      });
      socket.on("end", () => {
        finish(() => {
          const text = reply.replace(/\0/g, "").trim();
          if (/^stream: OK$/.test(text)) resolve("clean");
          else if (/ FOUND$/.test(text)) resolve("infected");
          else reject(unavailable());
        });
      });
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        for (let at = 0; at < data.length; at += CHUNK) {
          const part = data.subarray(at, at + CHUNK);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(part.length);
          socket.write(len);
          socket.write(part);
        }
        socket.write(Buffer.alloc(4)); // zero length ends the stream
      });
    });
  }
}
