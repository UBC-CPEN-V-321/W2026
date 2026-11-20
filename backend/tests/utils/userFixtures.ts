import { ObjectId } from 'mongodb';

import type { GoogleUserIdentity, UserPreferences } from '../../src/users/userTypes';

export const USER_FIXTURE_ID = '6705f0000000000000000001';
export const GOOGLE_USER_IDENTITY: GoogleUserIdentity = {
  googleSubject: 'google-subject-123',
  email: 'student@example.com',
  displayName: 'Student Name',
  profileImageUrl: null,
};

export const USER_PREFERENCES: UserPreferences = {
  transportation: { mode: 'walking' },
  budget: 'economical',
  interest: 'food',
};

/** Raw persisted user document used by UserDao tests. */
export function buildStoredUserDocument() {
  const now = new Date('2026-11-01T00:00:00.000Z');
  return {
    _id: new ObjectId(USER_FIXTURE_ID),
    ...GOOGLE_USER_IDENTITY,
    start_location: '',
    preferences: USER_PREFERENCES,
    onboardingCompletedAt: null,
    create_at: now,
    updated_at: now,
  };
}
