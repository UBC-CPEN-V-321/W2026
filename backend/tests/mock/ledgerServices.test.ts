import express from 'express';
import request from 'supertest';
import { createLedgerRouter } from '../../src/ledger/router';
import { FrankfurterFxProvider, OpenAiDocumentExtractor, LedgerServiceError, type DocumentExtractor, type FxProvider } from '../../src/ledger/providers';

// Mocked components: the OpenAI and Frankfurter HTTP `fetch`, the document extractors and the FX provider.
// Requests go through the real ledger router; no financial records are persisted by these interfaces.
type Fetch = typeof fetch;
const document = { fileName: 'receipt.pdf', mimeType: 'application/pdf', dataBase64: Buffer.from('%PDF-1.7\nexample').toString('base64'), defaultCurrency: 'CAD' };
const jpeg = { ...document, fileName: 'receipt.jpg', mimeType: 'image/jpeg', dataBase64: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]).toString('base64') };
const input = { kind: 'expense', amount: '12.34', currency: 'CAD', date: '2025-01-03', merchant: 'Cafe', category: 'Food', notes: '' };
const extraction = { candidates: [{ rowId: 'row-1', input, warnings: [] }], warnings: [] };
const placeholderKeys = ['', '   ', 'your_openai_api_key', 'YOUR_API_KEY', 'sk-your-api-key', '<OPENAI_API_KEY>'];
const originalKey = process.env.OPENAI_API_KEY;
beforeEach(() => { process.env.OPENAI_API_KEY = 'test-key'; });
afterAll(() => { if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; });

function service(dependencies: { extractor?: DocumentExtractor; fx?: FxProvider; localExtractor?: DocumentExtractor } = {}) {
  return express().use('/api/ledger', createLedgerRouter({
    extractor: { extract: jest.fn().mockResolvedValue(extraction) },
    fx: { quote: jest.fn().mockResolvedValue({ rate: '1.4411', date: '2025-01-03', source: 'test' }) },
    ...dependencies,
  }));
}
function fetchReturning(body: unknown) {
  return jest.fn<ReturnType<Fetch>, Parameters<Fetch>>().mockResolvedValue(new Response(JSON.stringify(body)));
}
function envelope(result: unknown) {
  return { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] };
}
// Real OpenAI adapter with a mocked HTTP client behind the real router.
function openAi(http: jest.Mock, timeoutMs?: number) {
  return service({ extractor: new OpenAiDocumentExtractor(http as unknown as Fetch, timeoutMs) });
}
const preview = (app: express.Express, body: object = document) => request(app).post('/api/ledger/imports/preview').send(body);
const sentBody = (http: jest.Mock) => JSON.parse(String(http.mock.calls[0]?.[1]?.body));

// Interface GET /api/ledger/meta
describe('Mocked: GET /api/ledger/meta', () => {
  // Input: GET while OPENAI_API_KEY is a setup placeholder; mock: extractor and FX provider
  // Expected status code: 200
  // Expected behavior: metadata and the provider agree that recognition is unavailable
  // Expected output: { documentImportAvailable: false }
  test.each(placeholderKeys)('Reports placeholder key %p as unavailable', async key => {
    process.env.OPENAI_API_KEY = key;
    const response = await request(service()).get('/api/ledger/meta');
    expect(response.status).toBe(200);
    expect(response.body.documentImportAvailable).toBe(false);
  });

  // Input: GET while a real-looking key is set
  // Expected status code: 200
  // Expected behavior: recognition is advertised as available
  // Expected output: { documentImportAvailable: true, localStatementImportAvailable: true }
  test('Reports configured recognition as available', async () => {
    const response = await request(service()).get('/api/ledger/meta');
    expect(response.body).toMatchObject({ documentImportAvailable: true, localStatementImportAvailable: true });
  });
});

// Interface GET /api/ledger/exchange
describe('Mocked: GET /api/ledger/exchange', () => {
  // Input: USD to CAD on Sunday 2025-01-05, asked twice; mock: Frankfurter fetch returns Friday's rate
  // Expected status code: 200
  // Expected behavior: the actual quote date is kept and the result is cached
  // Expected output: { rate: "1.4411", date: "2025-01-03", source: "Frankfurter / ECB" }; fetch called once
  test('Keeps the actual Friday quote date and caches it', async () => {
    const http = fetchReturning({ base: 'USD', date: '2025-01-03', rates: { CAD: 1.4411 } });
    const app = service({ fx: new FrankfurterFxProvider(http as unknown as Fetch) });
    const first = await request(app).get('/api/ledger/exchange?from=USD&to=CAD&date=2025-01-05');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ rate: '1.4411', date: '2025-01-03', source: 'Frankfurter / ECB' });
    await request(app).get('/api/ledger/exchange?from=USD&to=CAD&date=2025-01-05');
    expect(http).toHaveBeenCalledTimes(1);
  });

  // Input: USD to CAD; mock: Frankfurter returns a future date, a stale date, a zero rate, or the wrong base
  // Expected status code: 502
  // Expected behavior: invalid upstream data is never returned as a rate
  // Expected output: error about an invalid or stale rate
  test.each([
    { base: 'USD', date: '2025-01-06', rates: { CAD: 1.4 } },
    { base: 'USD', date: '2024-12-20', rates: { CAD: 1.4 } },
    { base: 'USD', date: '2025-01-03', rates: { CAD: 0 } },
    { base: 'EUR', date: '2025-01-03', rates: { CAD: 1.4 } },
  ])('Rejects invalid, stale or wrong-pair upstream data %#', async upstream => {
    const app = service({ fx: new FrankfurterFxProvider(fetchReturning(upstream) as unknown as Fetch) });
    const response = await request(app).get('/api/ledger/exchange?from=USD&to=CAD&date=2025-01-05');
    expect(response.status).toBe(502);
    expect(response.body.error).toContain('invalid or stale');
  });

  // Input: an impossible date, then a valid query; mock: the FX provider fails with 503
  // Expected status code: 400, then 503
  // Expected behavior: validation happens before the provider; provider failures are passed through
  // Expected output: error message
  test('Validates the query and preserves provider failure', async () => {
    const quote = jest.fn().mockRejectedValue(new LedgerServiceError(503, 'Unavailable'));
    const app = service({ fx: { quote } });
    expect((await request(app).get('/api/ledger/exchange?from=USD&to=CAD&date=2025-02-30')).status).toBe(400);
    expect(quote).not.toHaveBeenCalled();
    expect((await request(app).get('/api/ledger/exchange?from=USD&to=CAD&date=2025-01-03')).status).toBe(503);
  });

  // Input: 120 invalid queries from one client, then another
  // Expected status code: 400 each time, then 429
  // Expected behavior: exchange requests have their own per-client cap
  // Expected output: rate-limit error
  test('Limits exchange requests per client', async () => {
    const app = service();
    for (let index = 0; index < 120; index++) expect((await request(app).get('/api/ledger/exchange')).status).toBe(400);
    expect((await request(app).get('/api/ledger/exchange')).status).toBe(429);
  });
});

// Interface POST /api/ledger/imports/preview
describe('Mocked: POST /api/ledger/imports/preview', () => {
  // Input: valid PDF; mock: the extractor returns one candidate
  // Expected status code: 200
  // Expected behavior: the file signature is checked and the decoded bytes are sent for extraction
  // Expected output: { candidates, warnings } exactly as extracted, with Cache-Control no-store
  test('Returns editable previews only', async () => {
    const extract = jest.fn().mockResolvedValue(extraction);
    const response = await preview(service({ extractor: { extract } }));
    expect(response.status).toBe(200);
    expect(response.body).toEqual(extraction);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(extract.mock.calls[0]?.[0].bytes).toEqual(Buffer.from('%PDF-1.7\nexample'));
  });

  // Input: unsupported type, wrong signature, path in the name, bad currency, invalid or empty base64
  // Expected status code: 400 or 415
  // Expected behavior: rejected before any paid service call
  // Expected output: error message
  test.each([
    { ...document, mimeType: 'text/html' }, { ...document, mimeType: 'image/png' },
    { ...document, fileName: '../receipt.pdf' }, { ...document, defaultCurrency: 'BAD' },
    { ...document, dataBase64: 'abc%' }, { ...document, dataBase64: '' },
  ])('Rejects unsupported or malformed input %#', async body => {
    const extract = jest.fn();
    const response = await preview(service({ extractor: { extract } }), body);
    expect([400, 415]).toContain(response.status);
    expect(extract).not.toHaveBeenCalled();
  });

  // Input: a PDF of exactly 20 MiB or a JPEG of exactly 5 MiB, then one byte more
  // Expected status code: 200, then 413
  // Expected behavior: size limits are exact and enforced before extraction
  // Expected output: preview for the boundary size; error for the larger file
  test.each([['application/pdf', 20 * 1024 * 1024], ['image/jpeg', 5 * 1024 * 1024]] as const)('Enforces the %s size boundary', async (mimeType, maximum) => {
    const extract = jest.fn().mockResolvedValue(extraction);
    const bytes = Buffer.alloc(maximum);
    bytes.write(mimeType === 'application/pdf' ? '%PDF-' : '\xff\xd8\xff', 0, 'latin1');
    const response = await preview(service({ extractor: { extract } }), { ...document, mimeType, dataBase64: bytes.toString('base64') });
    expect(response.status).toBe(200);
    expect(extract).toHaveBeenCalledTimes(1);
    extract.mockClear();
    const oversized = Buffer.concat([bytes, Buffer.from([0])]);
    const rejected = await preview(service({ extractor: { extract } }), { ...document, mimeType, dataBase64: oversized.toString('base64') });
    expect(rejected.status).toBe(413);
    expect(extract).not.toHaveBeenCalled();
  });

  // Input: malformed JSON, then a 29 MB body
  // Expected status code: 400, then 413
  // Expected behavior: parser errors are answered safely
  // Expected output: error message
  test('Handles malformed and oversized JSON safely', async () => {
    const app = service();
    expect((await request(app).post('/api/ledger/imports/preview').set('Content-Type', 'application/json').send('{')).status).toBe(400);
    expect((await preview(app, { ...document, dataBase64: 'x'.repeat(29 * 1024 * 1024) })).status).toBe(413);
  });

  // Input: five valid uploads, then a sixth; mock: the extractor throws an error containing secrets
  // Expected status code: 500 five times, then 429
  // Expected behavior: unexpected errors are hidden and extraction is rate-limited; exchange stays available
  // Expected output: generic error without "secret"
  test('Limits extraction requests and hides unexpected errors', async () => {
    const app = service({ extractor: { extract: jest.fn().mockRejectedValue(new Error('secret-key-or-file-content')) } });
    for (let i = 0; i < 5; i++) {
      const response = await preview(app);
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('secret');
    }
    const blocked = await preview(app);
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect((await request(app).get('/api/ledger/exchange?from=CAD&to=USD&date=2025-01-03')).status).toBe(200);
  });

  // Input: valid PDF; mock: OpenAI fetch returns a draft with an empty date and a warning
  // Expected status code: 200
  // Expected behavior: the real adapter sends a strict schema with store:false and keeps incomplete drafts
  // Expected output: one candidate with date "" and warning "Date missing"; the key is never returned
  test('Sends a strict private request and keeps incomplete drafts', async () => {
    const http = fetchReturning(envelope({ transactions: [{ ...input, date: '', warnings: ['Date missing'] }], warnings: [] }));
    const response = await preview(openAi(http));
    expect(response.status).toBe(200);
    expect(response.body.candidates[0]?.input.date).toBe('');
    expect(response.body.candidates[0]?.warnings).toEqual(['Date missing']);
    expect(http.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/responses');
    const body = sentBody(http);
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.input[0].content[1].file_data).toBe(`data:application/pdf;base64,${document.dataBase64}`);
    expect(JSON.stringify(response.body)).not.toContain('test-key');
  });

  // Input: valid PDF; mock: OpenAI returns receipt details for one row, null details, two rows, or a malformed receipt
  // Expected status code: 200, 200, 200, then 502
  // Expected behavior: receipt details are returned only for a single valid receipt
  // Expected output: { receipt } for the first case; no receipt for the next two; error for the last
  test('Returns receipt details only for a single valid receipt', async () => {
    const receipt = { subtotal: '20.00', tax: '1.00', tip: '3.00', items: [{ name: 'Pasta', quantity: '2', unitPrice: '10.00' }] };
    const row = { ...input, warnings: [] };
    const run = (result: unknown) => preview(openAi(fetchReturning(envelope(result))));
    expect((await run({ transactions: [row], warnings: [], receipt })).body.receipt).toEqual(receipt);
    expect((await run({ transactions: [row], warnings: [], receipt: null })).body.receipt).toBeUndefined();
    expect((await run({ transactions: [row, row], warnings: [], receipt })).body.receipt).toBeUndefined();
    expect((await run({ transactions: [row], warnings: [], receipt: { ...receipt, tax: 1 } })).status).toBe(502);
  });

  // Input: valid JPEG; mock: OpenAI declines it as unreadable
  // Expected status code: 200
  // Expected behavior: images are sent as image input and no transaction is invented
  // Expected output: { candidates: [], warnings: [the decline message] }
  test('Declines unreadable documents without fabricating transactions', async () => {
    const warning = 'Unreadable financial document. Please upload a clearer receipt or statement.';
    const http = fetchReturning(envelope({ transactions: [], warnings: [warning] }));
    const response = await preview(openAi(http), jpeg);
    expect(response.status).toBe(200);
    expect(response.body.candidates).toEqual([]);
    expect(response.body.warnings).toEqual([warning]);
    const body = sentBody(http);
    expect(body.input[0].content[1].type).toBe('input_image');
    expect(body.instructions).toContain('blurred, obscured, unreadable or irrelevant');
    expect(body.instructions).toContain('Never guess transactions');
    expect(body.instructions).toContain('extract only those rows');
  });

  // Input: valid PDF; mock: OpenAI returns a card repayment and a merchant refund
  // Expected status code: 200
  // Expected behavior: explicit card repayments are skipped while merchant credits are kept
  // Expected output: one candidate "Shop refund" and a warning mentioning "Skipped 1"
  test('Excludes card repayments but keeps merchant credits', async () => {
    const http = fetchReturning(envelope({
      transactions: [
        { ...input, kind: 'income', merchant: 'ONLINE PAYMENT - THANK YOU', warnings: [] },
        { ...input, kind: 'income', merchant: 'Shop refund', warnings: ['Refund retained for review'] },
      ], warnings: [],
    }));
    const response = await preview(openAi(http));
    expect(response.body.candidates).toHaveLength(1);
    expect(response.body.candidates[0]?.input.merchant).toBe('Shop refund');
    expect(response.body.warnings.join(' ')).toContain('Skipped 1');
    expect(sentBody(http).instructions).toContain('billing-period');
    expect(sentBody(http).instructions).toContain('rewards/redemption');
  });

  // Input: valid PDF while OPENAI_API_KEY is missing or a placeholder; mock: OpenAI fetch
  // Expected status code: 503
  // Expected behavior: the external service is never called
  // Expected output: error saying recognition is not configured
  test.each([undefined, ...placeholderKeys])('Never calls OpenAI without a real key (%p)', async key => {
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
    const http = jest.fn();
    const response = await preview(openAi(http));
    expect(response.status).toBe(503);
    expect(response.body.error).toContain('not configured');
    expect(http).not.toHaveBeenCalled();
  });

  // Input: valid PDF; mock: OpenAI never answers, or its body stops arriving, within a 20 ms timeout
  // Expected status code: 504
  // Expected behavior: a slow service is reported as a timeout, not as unreachable
  // Expected output: error mentioning "took too long"
  test.each(['response', 'body'])('Reports a slow %s as a timeout', async part => {
    const http = jest.fn<ReturnType<Fetch>, Parameters<Fetch>>((_url, init) => part === 'response'
      ? new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))
      : Promise.resolve(new Response(new ReadableStream({
        start(controller) { init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason)); },
      }))));
    const response = await preview(openAi(http, 20));
    expect(response.status).toBe(504);
    expect(response.body.error).toContain('took too long');
  });

  // Input: valid PDF; mock: OpenAI fetch fails at the network level
  // Expected status code: 503
  // Expected behavior: the failure is reported as unreachable
  // Expected output: error mentioning "Cannot reach"
  test('Reports a network failure as unreachable', async () => {
    const http = jest.fn<ReturnType<Fetch>, Parameters<Fetch>>().mockRejectedValue(new TypeError('fetch failed'));
    const response = await preview(openAi(http));
    expect(response.status).toBe(503);
    expect(response.body.error).toContain('Cannot reach');
  });

  // Input: valid PDF; mock: OpenAI output is incomplete, a refusal, or malformed
  // Expected status code: 502, 422, 502
  // Expected behavior: no fabricated rows are returned
  // Expected output: error message
  test.each([
    [{ status: 'incomplete', output: [] }, 502],
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }, 422],
    [envelope({ transactions: [{ amount: 12 }], warnings: [] }), 502],
  ])('Rejects incomplete, refused or malformed output %#', async (upstream, status) => {
    const response = await preview(openAi(fetchReturning(upstream)));
    expect(response.status).toBe(status);
    expect(response.body).not.toHaveProperty('candidates');
  });
});

// Interface POST /api/ledger/imports/statement-preview
describe('Mocked: POST /api/ledger/imports/statement-preview', () => {
  // Input: valid PDF; mock: the local extractor succeeds, then fails to reconcile; the AI extractor is a spy
  // Expected status code: 200, then 422
  // Expected behavior: local preview never calls AI, even after a local failure
  // Expected output: { candidates, warnings }, then an error mentioning "reconcile"
  test('Never calls AI, including when local extraction fails', async () => {
    const ai = jest.fn();
    const local = jest.fn().mockResolvedValue(extraction);
    const app = service({ extractor: { extract: ai }, localExtractor: { extract: local } });
    const result = await request(app).post('/api/ledger/imports/statement-preview').send(document);
    expect(result.status).toBe(200);
    expect(result.body).toEqual(extraction);
    expect(result.headers['cache-control']).toBe('no-store');
    local.mockRejectedValueOnce(new LedgerServiceError(422, 'Could not reconcile statement totals.'));
    const failed = await request(app).post('/api/ledger/imports/statement-preview').send(document);
    expect(failed.status).toBe(422);
    expect(failed.body.error).toContain('reconcile');
    expect(ai).not.toHaveBeenCalled();
  });

  // Input: 20 empty requests, then another, then an AI preview; mock: both extractors
  // Expected status code: 400 twenty times, then 429; the AI preview is still accepted for validation (400)
  // Expected behavior: the local statement cap is independent of the AI cap
  // Expected output: rate-limit error with Retry-After and no retryAfterSeconds field
  test('Limits local previews independently of AI previews', async () => {
    const app = service();
    for (let index = 0; index < 20; index++) {
      expect((await request(app).post('/api/ledger/imports/statement-preview').send({})).status).toBe(400);
    }
    const blocked = await request(app).post('/api/ledger/imports/statement-preview').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.body).not.toHaveProperty('retryAfterSeconds');
    expect((await preview(app, {})).status).toBe(400);
  });

  // Input: valid PDF; mock: the local extractor throws an unexpected error
  // Expected status code: 500
  // Expected behavior: internal details are hidden
  // Expected output: generic error without the internal message
  test('Hides unexpected local extractor errors', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const app = service({ localExtractor: { extract: jest.fn().mockRejectedValue(new Error('internal parser path')) } });
      const res = await request(app).post('/api/ledger/imports/statement-preview').send(document);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('internal parser path');
    } finally { log.mockRestore(); }
  });
});
