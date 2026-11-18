import { createApp } from '../../src/app';
import { SessionModel, UserModel } from '../../src/userStore';
import { useIsolatedMongo } from './isolatedMongo';

/** A username account used by the account tests that run against MongoDB. */
export const patAccount = { username: 'pat_kim', password: 'a long passphrase', confirmPassword: 'a long passphrase' };

/** Real MongoDB user and session stores with a fresh app for every test; users and sessions are removed after each. */
export function useAccountDatabase(databaseName: string) {
  const { uri } = useIsolatedMongo(databaseName, [UserModel, SessionModel]);
  const context = { app: createApp(), uri };
  beforeEach(() => { context.app = createApp(); });
  return context;
}
