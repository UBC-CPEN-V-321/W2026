// Helpers for replacing the global fetch used by the Ticketmaster client in mocked tests.

/** One scripted outcome for a Ticketmaster HTTP request. */
export type FetchStep =
  | { kind: 'json'; status?: number; body: unknown }
  | { kind: 'status'; status: number }
  | { kind: 'network-error' };

/** Scripts a JSON response (HTTP 200 unless a status is given). */
export function jsonStep(body: unknown, status = 200): FetchStep {
  return { kind: 'json', status, body };
}

/** Scripts an error response with no usable body. */
export function statusStep(status: number): FetchStep {
  return { kind: 'status', status };
}

/** Scripts a network failure, which fetch reports as a TypeError. */
export function networkErrorStep(): FetchStep {
  return { kind: 'network-error' };
}

function toResponse(step: FetchStep): Response {
  if (step.kind === 'network-error') {
    throw new TypeError('fetch failed');
  }
  if (step.kind === 'status') {
    return new Response('{}', { status: step.status });
  }
  return new Response(JSON.stringify(step.body), { status: step.status ?? 200 });
}

/**
 * Replaces global fetch so each call plays the next scripted step in order.
 * A call beyond the script fails the test, which keeps attempt counts exact.
 * Restore it with `jest.restoreAllMocks()` in `afterEach`.
 * @param steps Outcomes for consecutive fetch calls.
 * @returns The fetch spy, for asserting call counts and request URLs.
 */
export function mockTicketmasterFetch(
  ...steps: FetchStep[]
): jest.SpiedFunction<typeof fetch> {
  const remaining = [...steps];
  return jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
    const step = remaining.shift();
    if (step === undefined) {
      return Promise.reject(new Error('Unexpected Ticketmaster request: no scripted response left'));
    }
    try {
      return Promise.resolve(toResponse(step));
    } catch (error: unknown) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
