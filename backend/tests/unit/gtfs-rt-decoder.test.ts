import { decodeFeed, FeedDecodeError } from '../../src/services/gtfs-rt-decoder';
import { alertEntity, feedBytes, pb, tripUpdateEntity } from '../helpers/gtfs-rt';

const NOW = 1_794_900_000; // 2026-11-17, seconds since the epoch
const DETOUR = 4;

describe('decodeFeed', () => {
  // Input: a trip updates feed with one run of the 99, late at one stop and early at the next
  // Expected: the header's timestamp, and the run's route, trip, direction and each stop's times and delays,
  //           with the early delay negative (protobuf sends it as a 10-byte varint)
  test('decodes a trip update', () => {
    const feed = decodeFeed(feedBytes(NOW, [tripUpdateEntity({
      id: 'tu-1',
      tripId: '15440288',
      routeId: '6641',
      directionId: 1,
      stops: [
        { stopId: '12057', departure: { time: NOW + 120, delay: 180 } },
        { stopId: '11588', arrival: { time: NOW + 1500, delay: -45 } },
      ],
    })]));

    expect(feed).toStrictEqual({
      timestamp: NOW,
      entities: [{
        id: 'tu-1',
        deleted: false,
        alert: null,
        tripUpdate: {
          tripId: '15440288',
          routeId: '6641',
          directionId: 1,
          cancelled: false,
          delay: null,
          stopTimeUpdates: [
            { stopId: '12057', arrival: null, departure: { delay: 180, time: NOW + 120 }, skipped: false },
            { stopId: '11588', arrival: { delay: -45, time: NOW + 1500 }, departure: null, skipped: false },
          ],
        },
      }],
    });
  });

  // Input: a cancelled run with a whole-trip delay, and a run that skips a stop
  // Expected: cancelled, the trip's delay, and the skipped stop
  test('decodes cancelled runs, skipped stops and whole-trip delays', () => {
    const feed = decodeFeed(feedBytes(NOW, [
      tripUpdateEntity({ id: 'a', routeId: '6641', cancelled: true, delay: 300, stops: [] }),
      tripUpdateEntity({ id: 'b', routeId: '6641', stops: [{ stopId: '12057', skipped: true }] }),
    ]));

    expect(feed.entities[0]?.tripUpdate).toMatchObject({ cancelled: true, delay: 300 });
    expect(feed.entities[1]?.tripUpdate?.stopTimeUpdates).toStrictEqual([
      { stopId: '12057', arrival: null, departure: null, skipped: true },
    ]);
  });

  // Input: an alerts feed with a detour on two routes and a stop, in effect for an hour, with English text
  // Expected: the periods, each selector, the effect by name, and the header and description
  test('decodes an alert', () => {
    const feed = decodeFeed(feedBytes(NOW, [alertEntity({
      id: 'alert-1',
      periods: [{ start: NOW, end: NOW + 3600 }],
      selectors: [{ routeId: '6641' }, { routeId: '30053', directionId: 0 }, { stopId: '12057', routeType: 3 }],
      effect: DETOUR,
      header: '99 detour',
      description: 'Buses detour via 10th Ave.',
    })]));

    expect(feed.entities).toStrictEqual([{
      id: 'alert-1',
      deleted: false,
      tripUpdate: null,
      alert: {
        activePeriods: [{ start: NOW, end: NOW + 3600 }],
        informedEntities: [
          { routeId: '6641', routeType: null, stopId: null, directionId: null },
          { routeId: '30053', routeType: null, stopId: null, directionId: 0 },
          { routeId: null, routeType: 3, stopId: '12057', directionId: null },
        ],
        effect: 'DETOUR',
        header: '99 detour',
        description: 'Buses detour via 10th Ave.',
      },
    }]);
  });

  // Input: alerts with no effect, an effect this decoder doesn't know, no text, and one marked deleted
  // Expected: the .proto's defaults (UNKNOWN_EFFECT, no text), and the deleted flag
  test('fills in alert defaults', () => {
    const feed = decodeFeed(feedBytes(NOW, [
      alertEntity({ id: 'a', selectors: [{ routeId: '6641' }] }),
      alertEntity({ id: 'b', selectors: [], effect: 99, deleted: true }),
    ]));

    expect(feed.entities[0]?.alert).toMatchObject({ activePeriods: [], effect: 'UNKNOWN_EFFECT', header: null, description: null });
    expect(feed.entities[1]).toMatchObject({ deleted: true, alert: { effect: 'UNKNOWN_EFFECT' } });
  });

  // Input: a header translated to French and English, and one with only an untagged translation
  // Expected: the English text, then the untagged one
  test('picks the English translation', () => {
    const alert = (translations: number[][]) => pb.message(2, pb.string(1, 'x'), pb.message(5, pb.message(10, ...translations)));
    const feed = decodeFeed(Uint8Array.from([
      ...alert([pb.message(1, pb.string(1, 'Détour'), pb.string(2, 'fr')), pb.message(1, pb.string(1, 'Detour'), pb.string(2, 'en-CA'))]),
      ...alert([pb.message(1, pb.string(1, 'Délai'), pb.string(2, 'fr')), pb.message(1, pb.string(1, 'Delay'))]),
    ]));

    expect(feed.entities.map((entity) => entity.alert?.header)).toStrictEqual(['Detour', 'Delay']);
  });

  // Input: a feed with fields this decoder doesn't use, of every wire type (vehicle positions, TransLink extensions,
  //        fixed-width numbers), and a known field number sent with an unexpected wire type
  // Expected: they are skipped, and the fields around them still decode
  test('skips unknown fields and unexpected wire types', () => {
    const bytes = Uint8Array.from([
      ...pb.message(1, pb.int(2, 0), pb.fixed64(9), pb.int(3, NOW)), // incrementality, then an unknown fixed64
      ...pb.message(2,
        pb.string(1, 'v-1'),
        pb.message(4, pb.string(1, 'bus 9001')), // a VehiclePosition
        pb.fixed32(1000), // an extension
        pb.string(2, 'not a bool'), // is_deleted as length-delimited
        pb.message(3, pb.message(1, pb.string(5, '6641'), pb.fixed32(6)), pb.int(4, NOW))), // timestamp, unused
      ...pb.string(15, 'trailing extension'),
    ]);

    const feed = decodeFeed(bytes);

    expect(feed.timestamp).toBe(NOW);
    expect(feed.entities).toHaveLength(1);
    expect(feed.entities[0]).toMatchObject({ id: 'v-1', deleted: false, tripUpdate: { routeId: '6641', directionId: null } });
  });

  // Input: no bytes
  // Expected: an empty feed, which TransLink sends when nothing is happening
  test('decodes an empty feed', () => {
    expect(decodeFeed(new Uint8Array())).toStrictEqual({ timestamp: null, entities: [] });
  });

  // Input: a buffer with an offset into a larger one, as Node's fetch and Buffer pools give
  // Expected: only the slice is read
  test('reads only its slice of a shared buffer', () => {
    const feed = feedBytes(NOW, [tripUpdateEntity({ id: 'tu', routeId: '6641', stops: [] })]);
    const shared = Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from(feed), Buffer.from([0xff])]);

    expect(decodeFeed(shared.subarray(2, 2 + feed.length)).entities[0]?.tripUpdate?.routeId).toBe('6641');
  });

  // Input: a feed cut off mid-message, an HTML error page, a length past the end, a varint that never ends,
  //        a field number of 0, and a cut-off fixed-width field
  // Expected: each throws FeedDecodeError, so the poller reports live: false instead of wrong data
  test('rejects bytes that are not a valid feed', () => {
    const feed = feedBytes(NOW, [tripUpdateEntity({ id: 'tu', routeId: '6641', stops: [{ stopId: '1', departure: { time: NOW } }] })]);
    const invalid = [
      feed.subarray(0, feed.length - 3),
      Buffer.from('<html><body>Rate limit exceeded</body></html>'),
      Uint8Array.from([0x12, 0x05, 0x0a]),
      Uint8Array.from([0x08, ...new Array<number>(11).fill(0xff)]),
      Uint8Array.from([0x00, 0x01]),
      Uint8Array.from([0x0d, 0x01]),
    ];

    for (const bytes of invalid) {
      expect(() => decodeFeed(bytes)).toThrow(FeedDecodeError);
    }
  });
});
