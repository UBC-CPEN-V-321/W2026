import type { User } from '../users/userTypes';

export type GoogleAuthResult = {
  sessionToken: string;
  expiresAt: Date;
  user: User;
};

export type CurrentSessionResult = {
  expiresAt: Date;
  user: User;
};
