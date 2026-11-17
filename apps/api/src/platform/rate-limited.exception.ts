import { HttpException, HttpStatus } from "@nestjs/common";

export class RateLimitedException extends HttpException {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests. Please try again later.", HttpStatus.TOO_MANY_REQUESTS);
  }
}
