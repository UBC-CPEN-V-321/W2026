import request from 'supertest';
import { mongoSessionStore, mongoUserStore, SessionModel, UserModel } from '../../src/userStore';
import { hashToken, startSession } from '../../src/session';
import { registerAccount } from '../helpers/registration';
import { patAccount as account, useAccountDatabase } from '../helpers/accountDatabase';

// Uses the real MongoDB stores against a local mongod. No mocked components.
const db = useAccountDatabase('account-settings-test');
const patch = (auth: string, body: object) => request(db.app).patch('/api/users/me').set('Authorization', auth).send(body);

// Interface PATCH /api/users/me
describe('Unmocked: PATCH /api/users/me', () => {
  // Input: new display name, phone, email and password with the current password
  // Expected status code: 200
  // Expected behavior: changes persist; other sessions are revoked; only the new password works
  // Expected output: { user } with the saved profile fields
  test('Persists profile and credential changes', async () => {
    const first = await registerAccount(db.app, account);
    const second = await request(db.app).post('/api/auth/login').send(account);
    const auth = `Bearer ${first.body.token}`;
    const changes = { displayName: 'Updated Pat', phoneNumber: '+1 604 555 0123',
      email: 'updated-pat@example.com', newPassword: 'updated passphrase', currentPassword: account.password };
    const saved = await patch(auth, changes);
    expect(saved.status).toBe(200);
    expect(saved.body.user).toMatchObject({ displayName: changes.displayName, phoneNumber: changes.phoneNumber,
      email: changes.email });
    const refreshed = await request(db.app).get('/api/users/me').set('Authorization', auth);
    expect(refreshed.body).toEqual(saved.body);
    expect((await request(db.app).get('/api/users/me').set('Authorization', `Bearer ${second.body.token}`)).status).toBe(401);
    expect((await request(db.app).post('/api/auth/login').send(account)).status).toBe(401);
    expect((await request(db.app).post('/api/auth/login').send({ username: account.username, password: changes.newPassword })).status).toBe(200);
  });

  // Input: password change while a legacy unversioned session and a delayed login session exist
  // Expected status code: 200
  // Expected behavior: every session except the changing one is invalidated atomically
  // Expected output: { user } without sessionVersion or retainedSessionHash
  test('Invalidates legacy and delayed sessions while keeping the changing session', async () => {
    const first = await registerAccount(db.app, account);
    const other = await request(db.app).post('/api/auth/login').send(account);
    const userId = first.body.user.id as string;
    // Existing accounts and sessions created before versioning must keep working until a credential change.
    await UserModel.updateOne({ _id: userId }, { $unset: { sessionVersion: '' } });
    await SessionModel.updateMany({ userId }, { $unset: { sessionVersion: '' } });
    const staleUser = (await mongoUserStore.findById(userId))!;
    const auth = `Bearer ${first.body.token}`;
    expect((await request(db.app).get('/api/users/me').set('Authorization', auth)).status).toBe(200);
    const changed = await patch(auth, { newPassword: 'new passphrase', currentPassword: account.password });
    expect(changed.status).toBe(200);
    expect(changed.body.user).not.toHaveProperty('sessionVersion');
    expect(changed.body.user).not.toHaveProperty('retainedSessionHash');
    // A login that read the old password before the update may create its session afterwards.
    const delayed = await startSession(mongoSessionStore, staleUser);
    for (const token of [other.body.token, delayed.token]) {
      expect(await mongoSessionStore.find(hashToken(token))).toBeNull();
      expect((await request(db.app).get('/api/users/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    }
    expect((await request(db.app).get('/api/users/me').set('Authorization', auth)).status).toBe(200);
    const latest = await request(db.app).post('/api/auth/login').send({ username: account.username, password: 'new passphrase' });
    expect(latest.status).toBe(200);
    const latestAuth = `Bearer ${latest.body.token}`;
    expect((await patch(latestAuth, { newPassword: 'next passphrase', currentPassword: 'new passphrase' })).status).toBe(200);
    expect((await request(db.app).get('/api/users/me').set('Authorization', auth)).status).toBe(401);
    expect((await request(db.app).get('/api/users/me').set('Authorization', latestAuth)).status).toBe(200);
  });

  // Input: add a contact email, then clear it, then change only the display name
  // Expected status code: 200 for each request
  // Expected behavior: the cleared email is removed from MongoDB and later edits still succeed
  // Expected output: { user } with an empty email
  test('Removes an optional contact email', async () => {
    const first = await registerAccount(db.app, account);
    const auth = `Bearer ${first.body.token}`;
    expect((await patch(auth, { email: 'contact@example.com', currentPassword: account.password })).status).toBe(200);
    expect((await patch(auth, { email: '', currentPassword: account.password })).status).toBe(200);
    expect((await mongoUserStore.findById(first.body.user.id))?.email).toBeUndefined();
    expect((await patch(auth, { displayName: 'Updated' })).status).toBe(200);
  });

  // Input: email already used by another account, with the current password
  // Expected status code: 409
  // Expected behavior: the unique email index rejects it; the account is unchanged
  // Expected output: error message
  test('Rejects an email used by another account', async () => {
    await UserModel.create({ username: 'taken', email: 'taken@example.com', displayName: 'Taken' });
    const first = await registerAccount(db.app, account);
    const res = await patch(`Bearer ${first.body.token}`, { email: 'TAKEN@example.com', currentPassword: account.password });
    expect(res.status).toBe(409);
    expect((await mongoUserStore.findById(first.body.user.id))?.email).toBeUndefined();
  });
});
