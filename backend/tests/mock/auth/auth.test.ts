import {
  gaxios,
  type TokenPayload,
  type VerifyIdTokenOptions,
} from 'google-auth-library';
import request from 'supertest';

import {
  GoogleTokenVerificationUnavailableError,
  InvalidGoogleTokenError,
} from '../../../src/auth/authError';
import {
  GoogleIdTokenVerifier,
  type GoogleVerificationClient,
} from '../../../src/auth/googleTokenVerifier';
import {
  AUTH_TEST_NOW as NOW,
  AUTH_TEST_USER_ID as USER_ID,
  createAuthTestApp as createTestApp,
  login,
} from '../../utils/authTestUtils';

describe('Authentication endpoints — with mocks', () => {
  test('first login creates a user and returns a session', async () => {
    const response = await login(createTestApp());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      expiresAt: '2026-10-23T12:00:00.000Z',
      user: {
        id: USER_ID,
        googleSubject: 'google-subject-123',
        email: 'student@example.com',
        displayName: 'Student Name',
        onboardingCompletedAt: null,
      },
    });
    expect(response.body.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  test('repeated login returns the existing user and a new session', async () => {
    const app = createTestApp();
    const first = await login(app);
    const second = await login(app);

    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(second.body.sessionToken).not.toBe(first.body.sessionToken);
  });

  test.each([
    [{}, 'INVALID_REQUEST', 400],
    [{ idToken: '' }, 'INVALID_REQUEST', 400],
    [{ idToken: 'invalid-google-token' }, 'INVALID_GOOGLE_TOKEN', 401],
    [
      { idToken: 'google-service-unavailable' },
      'AUTH_SERVICE_UNAVAILABLE',
      503,
    ],
    [{ idToken: 'unexpected-auth-error' }, 'INTERNAL_SERVER_ERROR', 500],
  ])('rejects invalid login input %#', async (body, code, status) => {
    const response = await request(createTestApp())
      .post('/api/v1/auth/google')
      .send(body);

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(JSON.stringify(response.body)).not.toContain('Sensitive provider failure');
  });

  test('logout revokes only the presented session', async () => {
    const app = createTestApp();
    const firstDevice = await login(app);
    const secondDevice = await login(app);

    const logout = await request(app)
      .delete('/api/v1/auth/session')
      .set('Authorization', `Bearer ${firstDevice.body.sessionToken}`);
    expect(logout.status).toBe(204);

    const revoked = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${firstDevice.body.sessionToken}`);
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('INVALID_SESSION');

    const stillActive = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${secondDevice.body.sessionToken}`);
    expect(stillActive.status).toBe(200);
    expect(stillActive.body.user.id).toBe(USER_ID);
  });

  test('logout requires a bearer token', async () => {
    const response = await request(createTestApp())
      .delete('/api/v1/auth/session');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_REQUIRED');
  });

});

{
  const CLIENT_ID = 'explore-ubc.apps.googleusercontent.com';
  const NOW = new Date('2026-10-22T12:00:00.000Z');
  const ID_TOKEN = 'secret-google-id-token';

  function payload(overrides: Partial<TokenPayload> = {}): TokenPayload {
    return {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'google-subject-123',
      iat: Math.floor(NOW.getTime() / 1000) - 60,
      exp: Math.floor(NOW.getTime() / 1000) + 3600,
      email: 'student@example.com',
      name: 'Student Name',
      picture: 'https://example.com/student.jpg',
      ...overrides,
    };
  }

  function payloadWithoutExpiry(): TokenPayload {
    const { exp: _expiry, ...claims } = payload();
    return claims as TokenPayload;
  }

  function payloadWithoutProfileClaims(): TokenPayload {
    const {
      email: _email,
      name: _name,
      picture: _picture,
      ...claims
    } = payload();
    return {
      ...claims,
      aud: ['another-client', CLIENT_ID] as unknown as string,
    };
  }

  function clientReturning(claims: TokenPayload | undefined): {
    client: GoogleVerificationClient;
    verifyIdToken: jest.Mock<
      Promise<{ getPayload(): TokenPayload | undefined }>,
      [VerifyIdTokenOptions]
    >;
  } {
    const verifyIdToken = jest.fn(
      async (_options: VerifyIdTokenOptions) => ({
        getPayload: () => claims,
      }),
    );
    return { client: { verifyIdToken }, verifyIdToken };
  }

  describe('Google ID token verification', () => {
    test('returns identity from valid verified claims', async () => {
      const fake = clientReturning(payload());
      const verifier = new GoogleIdTokenVerifier(
        CLIENT_ID,
        fake.client,
        () => NOW,
      );

      await expect(verifier.verify(ID_TOKEN)).resolves.toEqual({
        googleSubject: 'google-subject-123',
        email: 'student@example.com',
        displayName: 'Student Name',
        profileImageUrl: 'https://example.com/student.jpg',
      });
      expect(fake.verifyIdToken).toHaveBeenCalledWith({
        idToken: ID_TOKEN,
        audience: CLIENT_ID,
      });
    });

    test('accepts an audience list and defaults optional profile claims', async () => {
      const fake = clientReturning(payloadWithoutProfileClaims());
      const verifier = new GoogleIdTokenVerifier(
        CLIENT_ID,
        fake.client,
        () => NOW,
      );

      await expect(verifier.verify(ID_TOKEN)).resolves.toEqual({
        googleSubject: 'google-subject-123',
        email: '',
        displayName: '',
        profileImageUrl: null,
      });
    });

    test('uses the system clock when no test clock is provided', async () => {
      const fake = clientReturning(
        payload({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      );
      const verifier = new GoogleIdTokenVerifier(CLIENT_ID, fake.client);

      await expect(verifier.verify(ID_TOKEN)).resolves.toMatchObject({
        googleSubject: 'google-subject-123',
      });
    });

    test('rejects an empty token before calling Google', async () => {
      const fake = clientReturning(payload());
      const verifier = new GoogleIdTokenVerifier(
        CLIENT_ID,
        fake.client,
        () => NOW,
      );

      await expect(verifier.verify('   ')).rejects.toBeInstanceOf(
        InvalidGoogleTokenError,
      );
      expect(fake.verifyIdToken).not.toHaveBeenCalled();
    });

    test.each([
      ['missing payload', undefined],
      ['missing subject', payload({ sub: '' })],
      ['missing expiry', payloadWithoutExpiry()],
      ['wrong audience', payload({ aud: 'different-client-id' })],
      [
        'expired claims',
        payload({ exp: Math.floor(NOW.getTime() / 1000) - 1 }),
      ],
      ['wrong issuer', payload({ iss: 'https://attacker.example.com' })],
    ])('rejects %s', async (_caseName, claims) => {
      const fake = clientReturning(claims);
      const verifier = new GoogleIdTokenVerifier(
        CLIENT_ID,
        fake.client,
        () => NOW,
      );

      await expect(verifier.verify(ID_TOKEN)).rejects.toBeInstanceOf(
        InvalidGoogleTokenError,
      );
    });

    test('hides verification details and the raw token', async () => {
      const fakeClient: GoogleVerificationClient = {
        verifyIdToken: jest.fn(async () => {
          throw new Error(`Invalid signature for ${ID_TOKEN}`);
        }),
      };
      const verifier = new GoogleIdTokenVerifier(
        CLIENT_ID,
        fakeClient,
        () => NOW,
      );

      const error = await verifier
        .verify(ID_TOKEN)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(InvalidGoogleTokenError);
      expect(String(error)).not.toContain(ID_TOKEN);
      expect(String(error)).not.toContain('signature');
    });

    test('reports Google transport failures as temporarily unavailable', async () => {
      const fakeClient: GoogleVerificationClient = {
        verifyIdToken: jest.fn(async () => {
          throw new gaxios.GaxiosError('Google certificate request failed', {
            headers: new Headers(),
            url: new URL('https://www.googleapis.com/oauth2/v1/certs'),
          });
        }),
      };
      const verifier = new GoogleIdTokenVerifier(
        CLIENT_ID,
        fakeClient,
        () => NOW,
      );

      await expect(verifier.verify(ID_TOKEN)).rejects.toBeInstanceOf(
        GoogleTokenVerificationUnavailableError,
      );
    });
  });
}
