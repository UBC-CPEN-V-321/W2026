import routesFile from '../data/translink-routes.json';
import stopsFile from '../data/translink-stops.json';

/** A TransLink route from its static GTFS, with the stops it serves in each direction. */
export interface TranslinkRoute {
  id: string; // GTFS route_id, which the real-time feeds use
  shortName: string; // as TransLink writes it: "002", "R4", "WCE", or '' for SkyTrain lines and SeaBus
  longName: string; // e.g. "Broadway B-Line", "Expo Line"
  type: number; // GTFS route_type: 1 SkyTrain, 2 West Coast Express, 3 bus, 4 SeaBus
  stopsByDirection: [string[], string[]]; // stop_ids served in GTFS direction_id 0 and 1, in travel order
}

/** A stop or platform some TransLink route serves. */
export interface TranslinkStop {
  id: string; // GTFS stop_id
  name: string; // e.g. "UBC Exchange @ Bay 7", "Waterfront Station @ Platform 1"
  lat: number;
  lng: number;
  parentId: string | null; // the station a platform belongs to, which an alert may name instead
}

/** TransLink's routes and stops, and lookups by ID. */
export interface TranslinkStatic {
  feedVersion: string;
  routes: readonly TranslinkRoute[];
  stopsById: ReadonlyMap<string, TranslinkStop>;
}

/**
 * Indexes TransLink's routes and stops.
 *
 * @remarks
 * The data is `scripts/update-translink-gtfs.js`'s trimmed copy of TransLink's static GTFS, in `src/data/`. It's
 * taken as arguments so tests can build a small network of their own.
 */
export function buildTranslinkStatic(
  feedVersion: string,
  routes: readonly TranslinkRoute[],
  stops: readonly TranslinkStop[],
): TranslinkStatic {
  return { feedVersion, routes, stopsById: new Map(stops.map((stop) => [stop.id, stop])) };
}

let loaded: TranslinkStatic | null = null;

/** TransLink's network from the committed GTFS files, indexed the first time it's asked for. */
export function translinkStatic(): TranslinkStatic {
  loaded ??= buildTranslinkStatic(
    routesFile.feedVersion,
    routesFile.routes as TranslinkRoute[], // the script writes exactly two directions per route
    stopsFile.stops,
  );
  return loaded;
}
