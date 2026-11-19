import type { ErrorRequestHandler } from "express";
import { z } from "zod";
import { Prisma } from "./generated/prisma/client";

/**
 * An error the client can act on
 * @property status the HTTP status
 * @property code a stable code the app can branch on, e.g. "TEAM_FULL"
 * @property message the text to show the user, e.g. "Team is full"
 */
export interface ErrorDefinition {
  status: number;
  code: string;
  message: string;
}

/** The body of every error response */
export interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

/** Thrown anywhere in a request, errorHandler turns it into its status and an ErrorResponse */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(definition: ErrorDefinition, details?: unknown) {
    super(definition.message);
    this.name = "AppError";
    this.status = definition.status;
    this.code = definition.code;
    this.details = details;
  }
}

export const commonErrors = {
  InvalidRequest: { status: 400, code: "INVALID_REQUEST", message: "Invalid request" },
  RouteNotFound: { status: 404, code: "ROUTE_NOT_FOUND", message: "Not Found" },
  // Shared by every domain that looks up a user or court by ID
  UserNotFound: { status: 404, code: "USER_NOT_FOUND", message: "User not found" },
  CourtNotFound: { status: 404, code: "COURT_NOT_FOUND", message: "Court not found" },
  Internal: { status: 500, code: "INTERNAL_ERROR", message: "Internal server error" },
} satisfies Record<string, ErrorDefinition>;

// Fallbacks for Prisma errors no service mapped to a more specific message
const prismaErrors: Partial<Record<string, ErrorDefinition>> = {
  P2002: { status: 409, code: "ALREADY_EXISTS", message: "Already exists" },
  P2003: { status: 404, code: "NOT_FOUND", message: "Not found" },
  P2025: { status: 404, code: "NOT_FOUND", message: "Not found" },
  // Postgres aborted a transaction that clashed with another one
  P2034: { status: 409, code: "WRITE_CONFLICT", message: "Please try again" },
};

/**
 * Builds the body of an error response
 * @param error the error's definition, or an AppError
 * @param details extra data, e.g. the failed checks of an invalid request
 * @returns e.g. { error: "Team is full", code: "TEAM_FULL" }
 */
export function errorBody(error: ErrorDefinition, details?: unknown): ErrorResponse {
  const body: ErrorResponse = { error: error.message, code: error.code };
  if (details !== undefined) {
    body.details = details;
  }
  return body;
}

/**
 * Checks a request's body, query or params against a schema
 * @param schema the zod schema
 * @param value e.g. req.body
 * @returns the parsed value
 * @throws AppError 400 with the failed checks in details, e.g. { fieldErrors: { rounds: ["round 2 is tied"] } }
 */
export function parseRequest<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(commonErrors.InvalidRequest, z.flattenError(parsed.error));
  }
  return parsed.data;
}

/**
 * Turns the given Prisma errors of a database call into AppErrors with a specific message
 * @param work the database call
 * @param errors the definition for each Prisma error code, e.g. { P2002: gameErrors.AlreadyInGame }
 * @returns the call's result
 * @throws AppError for the given codes, and any other error unchanged
 */
export async function mapPrismaErrors<T>(
  work: Promise<T>,
  errors: Partial<Record<string, ErrorDefinition>>,
): Promise<T> {
  try {
    return await work;
  } catch (e) {
    const definition = e instanceof Prisma.PrismaClientKnownRequestError ? errors[e.code] : undefined;
    if (definition) {
      throw new AppError(definition);
    }
    throw e;
  }
}

/**
 * Lets work run in the background, logging its failure instead of throwing it, since whoever started it has
 * moved on (e.g. pushing a change to the clients after the change was saved)
 * @param work the background work
 * @param what what it does, for the log, e.g. "push the change of game <id>"
 */
export function logFailure(work: Promise<unknown>, what: string): void {
  work.catch((err: unknown) => {
    console.error(`Could not ${what}`, err);
  });
}

// body-parser's errors, e.g. malformed JSON (400) or a body that is too large (413)
function isClientHttpError(e: unknown): e is { status: number; message: string } {
  if (typeof e !== "object" || e === null) {
    return false;
  }
  const { status, expose } = e as { status?: unknown; expose?: unknown };
  return expose === true && typeof status === "number" && status >= 400 && status < 500;
}

function toAppError(e: unknown): AppError {
  if (e instanceof AppError) {
    return e;
  }

  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const definition = prismaErrors[e.code];
    if (definition) {
      return new AppError(definition);
    }
  }

  if (isClientHttpError(e)) {
    return new AppError({ ...commonErrors.InvalidRequest, status: e.status, message: e.message });
  }

  return new AppError(commonErrors.Internal);
}

/**
 * The last middleware: sends every error thrown in a route as an ErrorResponse.
 * Unexpected errors are logged and sent as a 500 without their details.
 * Express only treats a middleware with 4 parameters as an error handler, so next stays
 */
export const errorHandler: ErrorRequestHandler = (e, _req, res, next) => {
  // The response already started, so only Express's default handler can end it
  if (res.headersSent) {
    next(e);
    return;
  }

  const error = toAppError(e);
  if (error.status >= 500) {
    console.error(e);
  }
  res.status(error.status).json(errorBody(error, error.details));
};
