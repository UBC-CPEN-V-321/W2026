// Runs one Ticketmaster event sync against the database in MONGODB_URI.
//   npm run sync:events
// Kept outside src/ because it only wires a MongoDB connection to syncEvents (which is tested).
import { MongoClient } from 'mongodb';

import { env } from '../src/config/env';
import { EventDao } from '../src/events/eventDao';
import { syncEvents } from '../src/events/eventSync';

async function main(): Promise<void> {
  const mongoClient = new MongoClient(env.mongodbUri);
  await mongoClient.connect();

  try {
    const eventDao = new EventDao(mongoClient.db('cpen321'));
    await eventDao.createIndexes();
    const result = await syncEvents(eventDao);
    console.log('Event sync completed:', result);
  } finally {
    await mongoClient.close();
  }
}

main().catch((error: unknown) => {
  console.error('Event sync failed:', error);
  process.exitCode = 1;
});
