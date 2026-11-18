import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase, DuplicateAccountError, mongoUserStore, SessionModel, UserModel } from '../../src/userStore';
import { hashToken } from '../../src/session';
import { registerAccount } from '../helpers/registration';

// Store-level checks for the MongoDB user store. These call store functions directly, not an HTTP interface.
let mongo: MongoMemoryServer;
const app = createApp();
const account = { username: 'pat_kim', password: 'a long passphrase' };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri('user-store-test'));
}, 120000);
afterEach(async () => { await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({})]); });
afterAll(async () => {
  await disconnectDatabase();
  await mongo.stop();
}, 30000);

describe('mongoUserStore.linkGoogle', () => {
  test('links atomically, rejects stale credentials, and keeps the unique Google identity', async () => {
    const first = await registerAccount(app, account);
    const other = await registerAccount(app, { ...account, username: 'another' });
    const user = (await mongoUserStore.findById(first.body.user.id))!;
    const results = await Promise.all(['google-one', 'google-two'].map(googleId => mongoUserStore.linkGoogle(user.id, googleId, user.passwordHash!)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const linked = (await mongoUserStore.findById(user.id))!;
    expect(linked.passwordHash).toBe(user.passwordHash);
    expect(await mongoUserStore.linkGoogle(user.id, linked.googleId!, 'stale-password-hash')).toBeNull();
    const otherUser = (await mongoUserStore.findById(other.body.user.id))!;
    await expect(mongoUserStore.linkGoogle(otherUser.id, linked.googleId!, otherUser.passwordHash!)).rejects.toBeInstanceOf(DuplicateAccountError);
    expect((await mongoUserStore.findById(otherUser.id))?.googleId).toBeUndefined();
    expect((await request(app).get('/api/users/me').set('Authorization', `Bearer ${first.body.token}`)).status).toBe(200);
  });
});

describe('mongoUserStore.update', () => {
  test('a duplicate-key failure rolls back credential changes and session invalidation together', async () => {
    const first = await registerAccount(app, account);
    const other = await request(app).post('/api/auth/login').send(account);
    await UserModel.create({ username: 'taken', email: 'taken@example.com', displayName: 'Taken' });
    const userId = first.body.user.id as string;
    const before = await mongoUserStore.findById(userId);
    await expect(mongoUserStore.update(userId, { email: 'taken@example.com', displayName: 'Should not save' }, hashToken(first.body.token)))
      .rejects.toBeInstanceOf(DuplicateAccountError);
    expect(await mongoUserStore.findById(userId)).toEqual(before);
    for (const token of [first.body.token, other.body.token]) {
      expect((await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    }
  });
});
