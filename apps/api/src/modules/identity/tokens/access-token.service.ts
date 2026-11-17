import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { errors, jwtVerify, SignJWT } from "jose";
import { CONFIG, type AppConfig } from "../../../config/config.js";

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

const encoder = new TextEncoder();

@Injectable()
export class AccessTokenService {
  private readonly current: Uint8Array;
  private readonly previous: Uint8Array | undefined;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {
    this.current = encoder.encode(config.ACCESS_TOKEN_SECRET);
    this.previous = config.ACCESS_TOKEN_SECRET_PREVIOUS
      ? encoder.encode(config.ACCESS_TOKEN_SECRET_PREVIOUS)
      : undefined;
  }

  get ttlSeconds(): number {
    return this.config.ACCESS_TOKEN_TTL_SECONDS;
  }

  /** Claims are deliberately minimal: no email, role or permission data. */
  async sign(claims: AccessClaims, ttlSeconds = this.ttlSeconds): Promise<string> {
    return new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(claims.userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.current);
  }

  /** Returns the claims, or null for any invalid, expired or wrongly signed token. */
  async verify(token: string): Promise<AccessClaims | null> {
    for (const key of this.previous ? [this.current, this.previous] : [this.current]) {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
        if (typeof payload.sub === "string" && typeof payload["sid"] === "string") {
          return { userId: payload.sub, sessionId: payload["sid"] };
        }
        return null;
      } catch (e) {
        if (e instanceof errors.JWTExpired) return null;
        // Signature failures fall through to try the previous key.
      }
    }
    return null;
  }
}
