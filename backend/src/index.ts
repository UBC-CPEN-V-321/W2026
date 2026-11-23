import express, { type Express } from 'express';
import { MongoClient } from 'mongodb';

import {
  authenticateSession,
  requireUserOwnership,
} from './auth/authMiddleware';
import { createAuthRouter } from './auth/authRouter';
import { AuthService } from './auth/authService';
import { GoogleIdTokenVerifier } from './auth/googleTokenVerifier';
import { env } from './config/env';
import { EventDao } from './events/eventDao';
import type { EventRepository } from './events/eventRepository';
import { createEventRouter } from './events/eventRouter';
import { EventService } from './events/eventService';
import { ItineraryDao } from './itineraries/itineraryDao';
import type { ItineraryRepository } from './itineraries/itineraryRepository';
import { createItineraryRouter } from './itineraries/itineraryRouter';
import { ItineraryService } from './itineraries/itineraryService';
import { GoogleMapsClient } from './maps/googleMapsClient';
import { ItineraryMapDao } from './maps/itineraryMapDao';
import type { ItineraryMapRepository } from './maps/itineraryMapRepository';
import { createItineraryMapRouter } from './maps/itineraryMapRouter';
import { ItineraryMapService } from './maps/itineraryMapService';
import type { MapProvider } from './maps/mapProvider';
import { QwenClient } from './recommendation/qwenClient';
import { RecommendationDao } from './recommendation/recommendationDao';
import type { RecommendationRepository } from './recommendation/recommendationRepository';
import { createRecommendationRouter } from './recommendation/recommendationRouter';
import { RecommendationService } from './recommendation/recommendationService';
import type {
  ItineraryGenerator,
  ItineraryRanker,
} from './recommendation/recommendationTypes';
import { UniversalSentenceEncoderItineraryRanker } from './recommendation/universalSentenceEncoderRanker';
import { SessionDao } from './session/sessionDao';
import { SessionService } from './session/sessionService';
import { UserDao } from './users/userDao';
import type { UserRepository } from './users/userRepository';
import { createUserRouter } from './users/userRouter';
import { UserService } from './users/userService';

export type AppDependencies = {
  authService?: AuthService;
  eventRepository?: EventRepository;
  mapProvider?: MapProvider;
  itineraryMapRepository?: ItineraryMapRepository;
  itineraryRepository?: ItineraryRepository;
  recommendationGenerator?: ItineraryGenerator;
  recommendationRanker?: ItineraryRanker;
  recommendationRepository?: RecommendationRepository;
  sessionService?: Pick<SessionService, 'validateSession'>;
  userRepository?: UserRepository;
};

export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  if (dependencies.authService !== undefined) {
    app.use('/api/v1/auth', createAuthRouter(dependencies.authService));
  }

  const hasUserScopedRoutes =
    dependencies.userRepository !== undefined ||
    dependencies.itineraryRepository !== undefined;

  if (hasUserScopedRoutes) {
    if (dependencies.sessionService === undefined) {
      throw new Error(
        'A session service is required when user-scoped routes are configured.',
      );
    }

    app.use(
      '/api/v1/users/:userId',
      authenticateSession(dependencies.sessionService),
      requireUserOwnership,
    );
  }

  if (dependencies.userRepository !== undefined) {
    const userService = new UserService(dependencies.userRepository);
    app.use('/api/v1/users/:userId', createUserRouter(userService));
  }

  if (dependencies.itineraryRepository !== undefined) {
    const itineraryService = new ItineraryService(
      dependencies.itineraryRepository,
    );
    const itineraryMapService =
      dependencies.itineraryMapRepository === undefined
        ? undefined
        : new ItineraryMapService(
            dependencies.itineraryRepository,
            dependencies.itineraryMapRepository,
            dependencies.mapProvider ?? new GoogleMapsClient(),
          );
    if (itineraryMapService !== undefined) {
      app.use(
        '/api/v1/users/:userId/itineraries/:itineraryId/map',
        createItineraryMapRouter(itineraryMapService),
      );
    }
    app.use(
      '/api/v1/users/:userId/itineraries',
      createItineraryRouter(itineraryService, itineraryMapService),
    );
  }

  if (
    dependencies.eventRepository !== undefined &&
    dependencies.userRepository !== undefined
  ) {
    const eventService = new EventService(
      dependencies.eventRepository,
      dependencies.userRepository,
    );
    app.use(
      '/api/v1/users/:userId/events',
      createEventRouter(eventService),
    );
  }

  if (
    dependencies.recommendationRepository !== undefined &&
    dependencies.recommendationGenerator !== undefined &&
    dependencies.recommendationRanker !== undefined &&
    dependencies.userRepository !== undefined
  ) {
    const recommendationService = new RecommendationService(
      dependencies.recommendationRepository,
      dependencies.userRepository,
      dependencies.recommendationGenerator,
      dependencies.recommendationRanker,
    );
    app.use(
      '/api/v1/users/:userId/recommendations',
      createRecommendationRouter(recommendationService),
    );
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return app;
}

const mongoClient = new MongoClient(env.mongodbUri);
const database = mongoClient.db('cpen321');
const eventDao = new EventDao(database);
const userDao = new UserDao(database);
const itineraryDao = new ItineraryDao(database);
const itineraryMapDao = new ItineraryMapDao(database);
const sessionService = new SessionService(
  new SessionDao(database),
  env.sessionTtlDays,
);
const recommendationGenerator: ItineraryGenerator = new QwenClient(env.qwen);
const app = createApp({
  authService: new AuthService(
    new GoogleIdTokenVerifier(env.googleClientId),
    userDao,
    sessionService,
  ),
  eventRepository: eventDao,
  itineraryMapRepository: itineraryMapDao,
  itineraryRepository: itineraryDao,
  recommendationGenerator,
  recommendationRanker: new UniversalSentenceEncoderItineraryRanker(),
  recommendationRepository: new RecommendationDao(database),
  sessionService,
  userRepository: userDao,
});

async function start(): Promise<void> {
  await mongoClient.connect();
  await eventDao.createIndexes();
  await itineraryMapDao.createIndexes();

  const server = app.listen(env.port, () => {
    console.log(`Server listening on port ${env.port}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      server.close(() => {
        void mongoClient.close().finally(() => {
          process.exit(0);
        });
      });
    });
  }
}

if (require.main === module) {
  void start().catch((error: unknown) => {
    console.error('Failed to start the server:', error);
    process.exitCode = 1;
  });
}

export default app;
