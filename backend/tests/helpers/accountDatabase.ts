import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase, SessionModel, UserModel } from '../../src/userStore';

/** A username account used by the account tests that run against MongoDB. */
export const patAccount = { username: 'pat_kim', password: 'a long passphrase', confirmPassword: 'a long passphrase' };

/**
 * Real MongoDB user and session stores on an isolated in-memory mongod, with a fresh app for every test.
 * Users and sessions are removed after each test.
 */
export function useAccountDatabase(databaseName: string) {
  let mongo: MongoMemoryServer | undefined;
  const context = {
    app: createApp(),
    uri: () => {
      if (!mongo) throw new Error('The test database has not started.');
      return mongo.getUri(databaseName);
    },
  };
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(context.uri());
  }, 120000);
  beforeEach(() => { context.app = createApp(); });
  afterEach(async () => { await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({})]); });
  afterAll(async () => {
    await disconnectDatabase();
    await mongo?.stop();
  }, 30000);
  return context;
}
