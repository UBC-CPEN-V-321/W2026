import express from "express";
import request from "supertest";
import { z } from "zod";
import { Prisma } from "../../src/generated/prisma/client";
import {
  AppError,
  commonErrors,
  errorBody,
  errorHandler,
  mapPrismaErrors,
  parseRequest,
} from "../../src/errors";

const teamFull = { status: 409, code: "TEAM_FULL", message: "Team is full" };

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("db error", { code, clientVersion: "test" });
}

// An app whose only route throws the given error
function appThrowing(error: unknown) {
  const app = express();
  app.use(express.json());
  app.post("/", () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

describe("errors", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  // Input: an error definition, with and without details
  // Expected output: { error, code } and { error, code, details }
  test("errorBody builds the response body", () => {
    expect(errorBody(teamFull)).toEqual({ error: "Team is full", code: "TEAM_FULL" });
    expect(errorBody(teamFull, { team: 2 })).toEqual({
      error: "Team is full",
      code: "TEAM_FULL",
      details: { team: 2 },
    });
  });

  // Input: an error definition
  // Expected output: an Error with the definition's status, code and message
  test("AppError carries its definition", () => {
    const error = new AppError(teamFull);

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject(teamFull);
  });

  // Input: a valid and an invalid value for a schema
  // Expected behavior: the valid value is returned parsed, the invalid one throws a 400 with the failed checks
  test("parseRequest returns parsed data or throws InvalidRequest", () => {
    const schema = z.object({ team: z.coerce.number().int().min(1).max(2) });

    expect(parseRequest(schema, { team: "2" })).toEqual({ team: 2 });

    let thrown: unknown;
    try {
      parseRequest(schema, { team: 3 });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toMatchObject(commonErrors.InvalidRequest);
    expect((thrown as AppError).details).toMatchObject({ fieldErrors: { team: expect.any(Array) } });
  });

  // Input: database calls that resolve, fail with a mapped Prisma code, an unmapped code, and a non-Prisma error
  // Expected behavior: the result passes through, the mapped code becomes its AppError, the others are rethrown
  test("mapPrismaErrors maps only the given Prisma codes", async () => {
    const otherError = new Error("boom");
    const unmapped = prismaError("P2025");

    await expect(mapPrismaErrors(Promise.resolve(5), { P2002: teamFull })).resolves.toBe(5);
    await expect(mapPrismaErrors(Promise.reject(prismaError("P2002")), { P2002: teamFull })).rejects.toMatchObject(
      teamFull,
    );
    await expect(mapPrismaErrors(Promise.reject(unmapped), { P2002: teamFull })).rejects.toBe(unmapped);
    await expect(mapPrismaErrors(Promise.reject(otherError), { P2002: teamFull })).rejects.toBe(otherError);
  });

  // Input: a route throwing an AppError with details
  // Expected status code: 409
  // Expected output: { error: "Team is full", code: "TEAM_FULL", details: { team: 2 } }, nothing logged
  test("errorHandler sends an AppError as its status and body", async () => {
    const response = await request(appThrowing(new AppError(teamFull, { team: 2 }))).post("/");

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(teamFull, { team: 2 }));
    expect(consoleError).not.toHaveBeenCalled();
  });

  // Input: routes throwing the Prisma errors no service mapped
  // Expected status codes: 409 for P2002 and P2034, 404 for P2003 and P2025
  test.each([
    ["P2002", 409, "ALREADY_EXISTS"],
    ["P2003", 404, "NOT_FOUND"],
    ["P2025", 404, "NOT_FOUND"],
    ["P2034", 409, "WRITE_CONFLICT"],
  ])("errorHandler falls back to a generic error for Prisma %s", async (code, status, errorCode) => {
    const response = await request(appThrowing(prismaError(code))).post("/");

    expect(response.status).toBe(status);
    expect(response.body.code).toBe(errorCode);
  });

  // Input: a body that is not valid JSON
  // Expected status code: 400
  // Expected output: code INVALID_REQUEST with body-parser's message, not a 500
  test("errorHandler sends malformed JSON as a 400", async () => {
    const response = await request(appThrowing(new Error("unreachable")))
      .post("/")
      .set("Content-Type", "application/json")
      .send("{ not json");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_REQUEST");
    expect(consoleError).not.toHaveBeenCalled();
  });

  // Input: routes throwing an unexpected error and an unmapped Prisma error
  // Expected status code: 500
  // Expected behavior: the raw error is logged, never sent
  // Expected output: { error: "Internal server error", code: "INTERNAL_ERROR" }
  test.each([
    ["an unexpected error", new Error("secret db password in message")],
    ["an unmapped Prisma error", prismaError("P1001")],
    ["a thrown string", "boom"],
  ])("errorHandler logs %s and sends a bare 500", async (_name, error) => {
    const response = await request(appThrowing(error)).post("/");

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    expect(consoleError).toHaveBeenCalledWith(error);
  });
});
