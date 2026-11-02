import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Wraps a route handler: maps auth/rate-limit/validation errors to JSON, hides internals. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request", issues: e.issues }, { status: 400 });
      const status = (e as { status?: number }).status;
      if (status && status >= 400 && status < 600) {
        return NextResponse.json({ error: (e as Error).message }, { status });
      }
      console.error("[api]", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
