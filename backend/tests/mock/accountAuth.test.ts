import request from 'supertest';
import { createApp } from '../../src/app';
import { hashToken, SESSION_TTL_MS } from '../../src/session';
import { memoryStores } from '../helpers/memoryStores';
import { registerAccount } from '../helpers/registration';

// Mocked component: the MongoDB user and session stores are replaced by in-memory stores
// whose methods individual tests override to inject failures and races.
const account = { username: ' Sam_Lee ', password: 'correct horse', confirmPassword: 'correct horse' };

// Silences the expected 500 logs; individual tests replace store methods to inject failures.
beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());
const unavailable = async (): Promise<never> => { throw new Error('Database unavailable'); };

async function registered() {
  const stores = memoryStores();
  const app = createApp(stores);
  const res = await registerAccount(app, account);
  return { stores, app, token: res.body.token as string };
}

// Interface POST /api/auth/register
describe('Mocked: POST /api/auth/register', () => {
  // Input: valid username, password and confirmation
  // Expected status code: 201
  // Expected behavior: a scrypt hash is stored; a session starts; no secret is returned
  // Expected output: { user, token, expiresAt } with the normalized username
  test('Creates a username account and signs in', async () => {
    const stores = memoryStores();
    const res = await registerAccount(createApp(stores), account);
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.user).toEqual({
      id: 'user-1', email: '', username: 'sam_lee', displayName: 'sam_lee', signInMethods: ['password'], createdAt: expect.any(String),
      phoneNumber: '', avatarDataUrl: '',
    });
    expect(res.body.expiresAt).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60000);
    expect(stores.userList[0]?.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(res.body)).not.toContain('correct horse');
    expect(JSON.stringify(res.body)).not.toContain('scrypt');
    expect(stores.sessionMap.has(hashToken(res.body.token))).toBe(true);
  });

  // Input: a username already registered in a different case
  // Expected status code: 409
  // Expected behavior: no second account is created
  // Expected output: error message
  test('Rejects a duplicate username', async () => {
    const { app } = await registered();
    const res = await request(app).post('/api/auth/register').send({ ...account, username: 'SAM_LEE' });
    expect(res.status).toBe(409);
  });

  // Input: valid registration; mock: the store creates the same user twice, as a concurrent sign-up would
  // Expected status code: 409
  // Expected behavior: the duplicate reported by the unique index is surfaced as a conflict
  // Expected output: error message
  test('Reports a duplicate created concurrently', async () => {
    const stores = memoryStores();
    const create = stores.users.create;
    stores.users.create = async input => { await create(input); return create(input); };
    expect((await registerAccount(createApp(stores), account)).status).toBe(409);
  });

  // Input: registration that includes an invalid email, and the retired code-request endpoint
  // Expected status code: 201 for registration, 404 for the retired endpoint
  // Expected behavior: email input is ignored at registration
  // Expected output: stored user has no email
  test('Ignores email input and has no email verification endpoint', async () => {
    const stores = memoryStores();
    const app = createApp(stores);
    expect((await request(app).post('/api/auth/register/code').send({ email: 'unused@example.com' })).status).toBe(404);
    const res = await request(app).post('/api/auth/register').send({ ...account, email: 'invalid' });
    expect(res.status).toBe(201);
    expect(stores.userList[0]?.email).toBeUndefined();
  });

});

// Interface POST /api/auth/login
describe('Mocked: POST /api/auth/login', () => {
  // Input: correct credentials with the username in another case
  // Expected status code: 200
  // Expected behavior: a new session is stored for the account
  // Expected output: { user, token } with username "sam_lee"
  test('Signs in with username and password', async () => {
    const { app, stores } = await registered();
    const res = await request(app).post('/api/auth/login').send({ username: 'SAM_LEE', password: account.password });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('sam_lee');
    expect(stores.sessionMap.size).toBe(2);
  });

  // Input: wrong password, unknown username, and a Google-only account
  // Expected status code: 401
  // Expected behavior: the same message is returned for every case; no session is stored
  // Expected output: { error: "Incorrect username or password." }
  test('Rejects bad credentials without revealing which part is wrong', async () => {
    const { app, stores } = await registered();
    await stores.users.create({ username: 'google_user', displayName: 'G', googleId: 'g-1' });
    for (const body of [
      { username: account.username, password: 'wrong password' },
      { username: 'nobody', password: account.password },
      { username: 'google_user', password: account.password },
    ]) {
      const res = await request(app).post('/api/auth/login').send(body);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Incorrect username or password.');
    }
    expect(stores.sessionMap.size).toBe(1);
  });

  // Input: valid credentials; mock: the user lookup throws
  // Expected status code: 500
  // Expected behavior: no session is created and no internal detail is leaked
  // Expected output: { error: "Something went wrong. Please try again." }
  test('Reports a user store failure', async () => {
    const { app, stores } = await registered();
    stores.users.findByUsername = async () => { throw new Error('connection refused at 10.0.0.5'); };
    const res = await request(app).post('/api/auth/login').send(account);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
    expect(stores.sessionMap.size).toBe(1);
  });
});

// Interface POST /api/auth/logout
describe('Mocked: POST /api/auth/logout', () => {
  // Input: a valid bearer token while another session exists
  // Expected status code: 204
  // Expected behavior: only the current session ends
  // Expected output: empty body; the other token still works
  test('Ends the current session only', async () => {
    const { app, token } = await registered();
    const other = (await request(app).post('/api/auth/login').send(account)).body.token as string;
    expect((await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`)).status).toBe(204);
    expect((await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    expect((await request(app).get('/api/users/me').set('Authorization', `Bearer ${other}`)).status).toBe(200);
  });

  // Input: no header, an empty Bearer, an unknown token, or Basic authentication
  // Expected status code: 401
  // Expected behavior: nothing is deleted
  // Expected output: Bearer challenge
  test.each([undefined, 'Bearer', 'Bearer unknown-token-unknown-token', 'Basic abc'])('Requires a session (%s)', async header => {
    const { app } = await registered();
    const req = request(app).post('/api/auth/logout');
    const res = await (header ? req.set('Authorization', header) : req);
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  // Input: valid token; mock: session deletion throws
  // Expected status code: 500
  // Expected behavior: logout is not reported as successful
  // Expected output: { error: "Something went wrong. Please try again." }
  test('Reports a session store failure', async () => {
    const { app, token, stores } = await registered();
    stores.sessions.delete = unavailable;
    expect((await request(app).post('/api/auth/logout').auth(token, { type: 'bearer' })).status).toBe(500);
    expect(stores.sessionMap.size).toBe(1);
  });
});

// Interface GET /api/users/me
describe('Mocked: GET /api/users/me', () => {
  // Input: valid bearer token
  // Expected status code: 200
  // Expected behavior: the account is read without its password hash
  // Expected output: { user } with username "sam_lee"
  test('Returns the signed-in account', async () => {
    const { app, token } = await registered();
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: '', username: 'sam_lee', displayName: 'sam_lee', signInMethods: ['password'] });
    expect(JSON.stringify(res.body)).not.toContain('scrypt');
  });

  // Input: token whose session expiry has passed
  // Expected status code: 401
  // Expected behavior: the expired session is refused
  // Expected output: Bearer challenge
  test('Rejects an expired session', async () => {
    const { app, token, stores } = await registered();
    stores.sessionMap.get(hashToken(token))!.expiresAt = new Date(Date.now() - 1);
    expect((await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  // Input: token whose account was deleted
  // Expected status code: 401
  // Expected behavior: the orphaned session is removed
  // Expected output: Bearer challenge
  test('Rejects a session for a missing account', async () => {
    const { app, token, stores } = await registered();
    stores.userList.length = 0;
    expect((await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    expect(stores.sessionMap.size).toBe(0);
  });

  // Input: valid token; mock: the session lookup throws
  // Expected status code: 500
  // Expected behavior: account data is not returned
  // Expected output: { error: "Something went wrong. Please try again." }
  test('Reports a session store failure', async () => {
    const { app, token, stores } = await registered();
    stores.sessions.find = unavailable;
    const res = await request(app).get('/api/users/me').auth(token, { type: 'bearer' });
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('user');
  });
});
