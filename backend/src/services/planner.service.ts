import type { Types } from 'mongoose';
import type { Leg, Place } from '../models/trip.model';
import { DEFAULT_COST_VS_TIME, DEFAULT_MAX_WALK_MINUTES, type ParkingSpot, type User } from '../models/user.model';
import type { PlanRequest } from '../validation/plan-request.validation';
import { getParkingSpots } from './parking-spot.service';
import { performance } from 'node:perf_hooks';
import {
  chainLowerBound,
  chooseRoute,
  filterChains,
  pickThree,
  priceChain,
  pruneSpots,
  scheduleChain,
  scheduleDetailedChain,
  scheduleDetailedSingle,
  selectCandidates,
  type CandidateRoute,
  type CandidateSpot,
  type ChainEstimate,
  type PlannerPlace,
} from './planner.core';
import {
  computeRouteDetails,
  computeRouteMatrix,
  type MatrixElement,
  type PlannerMode,
  type RouteDetail,
} from './planner.google.service';
import { normalizeRouteLegs } from './route-legs';
import { zonesForTransitLines } from './transit-zones';

const PARKING_BUFFER_SECONDS = 300;
const GOOGLE_DEPARTURE_BUFFER_MS = 60_000;
const BASELINE_DRIVE_ID = 'BASELINE_DRIVE';
const BASELINE_TRANSIT_ID = 'BASELINE_TRANSIT';

export type RouteLabel = 'CHEAPEST' | 'FASTEST' | 'BALANCED';

export interface PlanLeg extends Omit<Leg, 'mode' | 'transitLines' | 'departAt' | 'arriveAt'> {
  mode: PlannerMode | 'WALK';
  departAt: string;
  arriveAt: string;
  transitLines: RouteDetail['transitLines'];
}

export interface RouteOption {
  label: RouteLabel;
  leaveAt: string;
  arriveAt: string;
  lateByMinutes: number;
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  totalCostCents: number;
  costBreakdown: { fuelCents: number; parkingCents: number; fareCents: number };
  costEstimated: boolean;
  baselineDriveCostCents: number | null;
  transferPoints: Place[];
  transfers: number;
  legs: PlanLeg[];
}

export type PlannerWarning = 'NO_PARKING_SPOTS' | 'GAS_PRICE_MISSING' | 'VEHICLE_MISSING';

export interface PlanResponse {
  options: RouteOption[];
  warnings: PlannerWarning[];
}

interface PlanCandidate extends CandidateRoute {
  kind: 'CHAIN' | 'DRIVE' | 'TRANSIT';
  spot: CandidateSpot | null;
  drive: MatrixElement | null;
  transit: MatrixElement | null;
}

interface DetailedCandidate {
  option: RouteOption;
  score: number;
  spotId: string;
}

const NO_PARKING_SPOT: CandidateSpot = {
  label: '',
  location: { lat: 0, lng: 0 },
  placeId: null,
  rateCents: 0,
  ratePer: 'DAY',
  overnightAllowed: true,
};

function toPlace(place: PlannerPlace): Place {
  return { ...place };
}

function spotPlace(spot: CandidateSpot): PlannerPlace {
  return { label: spot.label, ...spot.location, placeId: spot.placeId };
}

function makeCandidate(input: {
  kind: PlanCandidate['kind'];
  spot: CandidateSpot | null;
  drive: MatrixElement | null;
  transit: MatrixElement | null;
  driveDistanceMeters: number;
  transitDistanceMeters: number;
  schedule: ReturnType<typeof scheduleChain>;
  price: ReturnType<typeof priceChain>;
}): PlanCandidate {
  return {
    ...input.price,
    spotId: input.spot?._id?.toString() ?? (input.kind === 'DRIVE' ? BASELINE_DRIVE_ID : BASELINE_TRANSIT_ID),
    label: 'BALANCED',
    leaveAt: input.schedule.leaveAt,
    parkedFromAt: input.schedule.driveArriveAt,
    arriveAt: input.schedule.arriveAt,
    lateByMinutes: input.schedule.lateByMinutes,
    overnightAllowed: input.spot?.overnightAllowed ?? true,
    transferPoint: input.spot === null ? null : spotPlace(input.spot),
    walkSeconds: 0,
    kind: input.kind,
    spot: input.spot,
    drive: input.drive,
    transit: input.transit,
  };
}

function priceCandidate(input: {
  user: User;
  spot: CandidateSpot;
  driveDistanceMeters: number;
  transitDistanceMeters: number;
  durationSeconds: number;
  parkedSeconds: number;
  costVsTime: number;
  zones: number;
  includeFuel: boolean;
  includeFare: boolean;
}): ReturnType<typeof priceChain> {
  return priceChain({
    driveDistanceMeters: input.driveDistanceMeters,
    transitDistanceMeters: input.transitDistanceMeters,
    totalDurationSeconds: input.durationSeconds,
    parkedSeconds: input.parkedSeconds,
    spot: input.spot,
    vehicle: input.user.vehicle,
    gasCentsPerLitre: input.user.lastGasPrice?.centsPerLitre ?? null,
    transit: input.user.transit,
    transitZones: input.zones,
    costVsTime: input.costVsTime,
    includeFuel: input.includeFuel,
    includeFare: input.includeFare,
  });
}

function toDetailedLeg(
  mode: PlannerMode,
  from: PlannerPlace,
  to: PlannerPlace,
  detail: RouteDetail,
  costCents: number,
): PlanLeg {
  return {
    mode,
    from: toPlace(from),
    to: toPlace(to),
    departAt: detail.departAt,
    arriveAt: detail.arriveAt,
    durationSeconds: detail.durationSeconds,
    distanceMeters: detail.distanceMeters,
    costCents,
    polyline: detail.polyline,
    transitLines: detail.transitLines,
    steps: mode === 'DRIVE' ? detail.navigation : [], // a transit leg is boarded, not turned through
  };
}

function transitLegs(origin: PlannerPlace, destination: PlannerPlace, detail: RouteDetail, fareCents: number): PlanLeg[] {
  const steps = detail.steps.filter((step) => step.durationSeconds > 0 && step.polyline !== '');
  if (steps.length === 0) return [toDetailedLeg('TRANSIT', origin, destination, detail, fareCents)];

  let fareAssigned = false;
  let previousArrival = detail.departAt;
  return steps.map((step, index) => {
    const departAt = step.departAt || previousArrival;
    const arriveAt = step.arriveAt || new Date(Date.parse(departAt) + step.durationSeconds * 1000).toISOString();
    previousArrival = arriveAt;
    const from: Place = {
      label: step.from.label || (index === 0 ? origin.label : ''),
      lat: step.from.lat,
      lng: step.from.lng,
      placeId: null,
    };
    const to: Place = {
      label: step.to.label || (index === steps.length - 1 ? destination.label : ''),
      lat: step.to.lat,
      lng: step.to.lng,
      placeId: null,
    };
    const costCents = step.mode === 'TRANSIT' && !fareAssigned ? fareCents : 0;
    if (step.mode === 'TRANSIT') fareAssigned = true;
    return {
      mode: step.mode,
      from,
      to,
      departAt,
      arriveAt,
      durationSeconds: step.durationSeconds,
      distanceMeters: step.distanceMeters,
      costCents,
      polyline: step.polyline,
      transitLines: step.transitLine === null ? [] : [step.transitLine],
      steps: step.navigation,
    };
  });
}

// how many times the trip changes vehicle: car to bus, or bus to train; walking between doesn't count
function vehicleChanges(legs: readonly PlanLeg[]): number {
  return Math.max(0, legs.filter((leg) => leg.mode !== 'WALK').length - 1);
}

// the user's longest allowed walking stretch for this trip: the request's, then their saved one
function maxWalkSeconds(request: PlanRequest, user: User): number {
  return (request.maxWalkMinutes ?? user.maxWalkMinutes ?? DEFAULT_MAX_WALK_MINUTES) * 60;
}

function makeOption(
  candidate: PlanCandidate,
  schedule: ReturnType<typeof scheduleChain>,
  price: ReturnType<typeof priceChain>,
  legs: PlanLeg[],
  label: RouteLabel,
  baselineDriveCostCents: number | null,
  origin: PlannerPlace,
  destination: PlannerPlace,
): RouteOption {
  const normalizedLegs = normalizeRouteLegs(legs, toPlace(origin), toPlace(destination));
  return {
    label,
    leaveAt: schedule.leaveAt.toISOString(),
    arriveAt: schedule.arriveAt.toISOString(),
    lateByMinutes: schedule.lateByMinutes,
    totalDurationSeconds: Math.max(0, Math.round((schedule.arriveAt.getTime() - schedule.leaveAt.getTime()) / 1000)),
    totalDistanceMeters: normalizedLegs.reduce((total, leg) => total + leg.distanceMeters, 0),
    totalCostCents: price.totalCostCents,
    costBreakdown: price.costBreakdown,
    costEstimated: price.costEstimated,
    baselineDriveCostCents,
    transferPoints: candidate.spot === null ? [] : [toPlace(spotPlace(candidate.spot))],
    transfers: vehicleChanges(normalizedLegs),
    legs: normalizedLegs,
  };
}

async function getDetailedCandidate(
  candidate: PlanCandidate,
  label: RouteLabel,
  request: PlanRequest,
  user: User,
  now: Date,
  costVsTime: number,
  baselineDriveCostCents: number | null,
): Promise<DetailedCandidate | null> {
  if (candidate.kind === 'CHAIN') {
    if (candidate.spot === null || candidate.drive === null || candidate.transit === null) return null;
    const transfer = spotPlace(candidate.spot);
    const routingNow = new Date(now.getTime() + GOOGLE_DEPARTURE_BUFFER_MS);
    const estimate = scheduleChain(candidate.drive.durationSeconds, candidate.transit.durationSeconds, request.arriveBy, routingNow);
    const maxWalk = maxWalkSeconds(request, user);
    const [driveRoutes, transitRoutes] = await Promise.all([
      computeRouteDetails(request.origin, transfer, 'DRIVE', { departureTime: estimate.leaveAt.toISOString() }),
      computeRouteDetails(transfer, request.destination, 'TRANSIT', request.arriveBy === null
        ? { departureTime: estimate.transitDepartAt.toISOString() }
        : { arrivalTime: request.arriveBy.toISOString() }),
    ]);
    const driveDetail = chooseRoute(driveRoutes, maxWalk);
    const transitDetail = chooseRoute(transitRoutes, maxWalk);
    if (driveDetail === null || transitDetail === null) return null;

    const schedule = scheduleDetailedChain(
      driveDetail.durationSeconds,
      transitDetail.durationSeconds,
      transitDetail.departAt === '' ? null : new Date(transitDetail.departAt),
      transitDetail.arriveAt === '' ? null : new Date(transitDetail.arriveAt),
      request.arriveBy,
      now,
    );
    const price = priceCandidate({
      user,
      spot: candidate.spot,
      driveDistanceMeters: driveDetail.distanceMeters,
      transitDistanceMeters: transitDetail.distanceMeters,
      durationSeconds: driveDetail.durationSeconds + PARKING_BUFFER_SECONDS + transitDetail.durationSeconds,
      parkedSeconds: Math.max(0, (schedule.arriveAt.getTime() - schedule.driveArriveAt.getTime()) / 1000),
      costVsTime,
      zones: zonesForTransitLines(transitDetail.transitLines),
      includeFuel: true,
      includeFare: true,
    });
    const legs = [
      toDetailedLeg('DRIVE', request.origin, transfer, driveDetail, price.costBreakdown.fuelCents + price.costBreakdown.parkingCents),
      ...transitLegs(transfer, request.destination, transitDetail, price.costBreakdown.fareCents),
    ];
    return {
      option: makeOption(candidate, schedule, price, legs, label, baselineDriveCostCents, request.origin, request.destination),
      score: price.score,
      spotId: candidate.spotId,
    };
  }

  const mode = candidate.kind;
  const earliestDeparture = new Date(now.getTime() + GOOGLE_DEPARTURE_BUFFER_MS);
  const estimatedLeaveAt = request.arriveBy === null ||
    request.arriveBy.getTime() - candidate.totalDurationSeconds * 1000 < earliestDeparture.getTime()
    ? earliestDeparture
    : new Date(request.arriveBy.getTime() - candidate.totalDurationSeconds * 1000);
  const routes = await computeRouteDetails(request.origin, request.destination, mode, mode === 'DRIVE' || request.arriveBy === null
    ? { departureTime: estimatedLeaveAt.toISOString() }
    : { arrivalTime: request.arriveBy.toISOString() });
  const detail = chooseRoute(routes, maxWalkSeconds(request, user));
  if (detail === null) return null;

  const schedule = scheduleDetailedSingle(
    detail.durationSeconds,
    detail.departAt === '' ? null : new Date(detail.departAt),
    detail.arriveAt === '' ? null : new Date(detail.arriveAt),
    request.arriveBy,
    now,
  );
  const price = priceCandidate({
    user,
    spot: NO_PARKING_SPOT,
    driveDistanceMeters: mode === 'DRIVE' ? detail.distanceMeters : 0,
    transitDistanceMeters: mode === 'TRANSIT' ? detail.distanceMeters : 0,
    durationSeconds: detail.durationSeconds,
    parkedSeconds: 0,
    costVsTime,
    zones: mode === 'TRANSIT' ? zonesForTransitLines(detail.transitLines) : 1,
    includeFuel: mode === 'DRIVE',
    includeFare: mode === 'TRANSIT',
  });
  const legs = mode === 'TRANSIT'
    ? transitLegs(request.origin, request.destination, detail, price.costBreakdown.fareCents)
    : [toDetailedLeg('DRIVE', request.origin, request.destination, detail, price.costBreakdown.fuelCents)];
  return {
    option: makeOption(candidate, schedule, price, legs, label, baselineDriveCostCents, request.origin, request.destination),
    score: price.score,
    spotId: candidate.spotId,
  };
}

function sortForLabel(candidates: readonly PlanCandidate[], label: RouteLabel): PlanCandidate[] {
  return [...candidates].sort((a, b) => {
    if (label === 'CHEAPEST') return a.totalCostCents - b.totalCostCents || a.arriveAt.getTime() - b.arriveAt.getTime();
    if (label === 'FASTEST') return a.totalDurationSeconds - b.totalDurationSeconds || a.totalCostCents - b.totalCostCents;
    return a.score - b.score || a.totalCostCents - b.totalCostCents;
  });
}

// what screening needs about the trip being planned
interface ScreeningContext {
  request: PlanRequest;
  user: User;
  now: Date;
  costVsTime: number;
}

// a spot that may still win, with its drive from the origin and its lower bound
interface SpotBound extends ChainEstimate {
  spot: CandidateSpot;
  drive: MatrixElement;
}

// prices the drive leg and parking of a chain through [spot], screened with matrix times
function chainCandidate(spot: CandidateSpot, drive: MatrixElement, transit: MatrixElement, context: ScreeningContext): PlanCandidate {
  const schedule = scheduleChain(drive.durationSeconds, transit.durationSeconds, context.request.arriveBy, context.now);
  const price = priceCandidate({
    user: context.user,
    spot,
    driveDistanceMeters: drive.distanceMeters,
    transitDistanceMeters: transit.distanceMeters,
    durationSeconds: drive.durationSeconds + PARKING_BUFFER_SECONDS + transit.durationSeconds,
    parkedSeconds: Math.max(0, (schedule.arriveAt.getTime() - schedule.driveArriveAt.getTime()) / 1000),
    costVsTime: context.costVsTime,
    zones: 1,
    includeFuel: true,
    includeFare: true,
  });
  return makeCandidate({
    kind: 'CHAIN', spot, drive, transit,
    driveDistanceMeters: drive.distanceMeters,
    transitDistanceMeters: transit.distanceMeters,
    schedule,
    price,
  });
}

// prices a drive-only or transit-only route from its matrix element
function baselineCandidate(kind: 'DRIVE' | 'TRANSIT', element: MatrixElement, context: ScreeningContext): PlanCandidate {
  const isDrive = kind === 'DRIVE';
  const schedule = scheduleDetailedSingle(element.durationSeconds, null, null, context.request.arriveBy, context.now);
  const price = priceCandidate({
    user: context.user,
    spot: NO_PARKING_SPOT,
    driveDistanceMeters: isDrive ? element.distanceMeters : 0,
    transitDistanceMeters: isDrive ? 0 : element.distanceMeters,
    durationSeconds: element.durationSeconds,
    parkedSeconds: 0,
    costVsTime: context.costVsTime,
    zones: 1,
    includeFuel: isDrive,
    includeFare: !isDrive,
  });
  return makeCandidate({
    kind,
    spot: null,
    drive: isDrive ? element : null,
    transit: isDrive ? null : element,
    driveDistanceMeters: isDrive ? element.distanceMeters : 0,
    transitDistanceMeters: isDrive ? 0 : element.distanceMeters,
    schedule,
    price,
  });
}

// the spots that could still beat both baselines, given their drives and a lower bound on their transit rides
function survivingSpots(
  spots: readonly CandidateSpot[],
  driveByDestination: ReadonlyMap<number, MatrixElement>,
  baselines: readonly PlanCandidate[],
  context: ScreeningContext,
): SpotBound[] {
  const bounds = spots.flatMap((spot, index) => {
    const drive = driveByDestination.get(index);
    if (drive === undefined) return [];
    return [{
      spot,
      drive,
      ...chainLowerBound({
        driveSeconds: drive.durationSeconds,
        driveMeters: drive.distanceMeters,
        spot,
        destination: context.request.destination,
        user: context.user,
        costVsTime: context.costVsTime,
      }),
    }];
  });
  const known = baselines.map((baseline) => ({
    durationSeconds: baseline.totalDurationSeconds,
    costCents: baseline.totalCostCents,
    score: baseline.score,
  }));
  const costReference = baselines.find((baseline) => baseline.kind === 'TRANSIT')?.totalCostCents ?? null;
  return pruneSpots(bounds, known, costReference);
}

// runs [work] and measures how long it took, for the screening log
async function timed<T>(work: () => Promise<T>): Promise<{ result: T; milliseconds: number }> {
  const startedAt = performance.now();
  const result = await work();
  return { result, milliseconds: performance.now() - startedAt };
}

// one line per plan, so the cost and latency of pruning can be measured
function logScreening(stats: { spots: number; pruned: number; elements: number; firstWaveMs: number; secondWaveMs: number }): void {
  console.info(
    `Planner screening: ${stats.elements} matrix elements for ${stats.spots} spots, ${stats.pruned} pruned, ` +
    `wave 1 ${Math.round(stats.firstWaveMs)} ms, wave 2 ${Math.round(stats.secondWaveMs)} ms`,
  );
}

/**
 * Screens every route the Planner could offer with Route Matrix times. Wave 1 prices the drives to every spot and
 * both baselines at once; spots that can't beat a baseline even with the fastest possible transit ride are then
 * pruned, and wave 2 prices transit only from the spots that survive.
 */
async function screenCandidates(
  spots: readonly CandidateSpot[],
  canDrive: boolean,
  canTransit: boolean,
  context: ScreeningContext,
): Promise<PlanCandidate[]> {
  const { request, now } = context;
  const transitTime = request.arriveBy === null
    ? { departureTime: new Date(now.getTime() + PARKING_BUFFER_SECONDS * 1000).toISOString() }
    : { arrivalTime: request.arriveBy.toISOString() };
  const driveDestinations = [...spots.map(spotPlace), request.destination];
  const firstWave = await timed(() => Promise.all([
    canDrive
      ? computeRouteMatrix([request.origin], driveDestinations, 'DRIVE', {
        departureTime: new Date(now.getTime() + GOOGLE_DEPARTURE_BUFFER_MS).toISOString(),
      })
      : Promise.resolve([]),
    canTransit ? computeRouteMatrix([request.origin], [request.destination], 'TRANSIT', transitTime) : Promise.resolve([]),
  ]));
  const [driveMatrix, transitMatrix] = firstWave.result;
  const driveByDestination = new Map(driveMatrix.map((element) => [element.destinationIndex, element]));
  const directDrive = driveByDestination.get(spots.length);
  const directTransit = transitMatrix[0];
  const baselines = [
    ...(directDrive === undefined ? [] : [baselineCandidate('DRIVE', directDrive, context)]),
    ...(directTransit === undefined ? [] : [baselineCandidate('TRANSIT', directTransit, context)]),
  ];

  const drivableSpots = spots.filter((_, index) => driveByDestination.has(index)).length;
  const survivors = survivingSpots(spots, driveByDestination, baselines, context);
  const secondWave = await timed(() => (survivors.length === 0
    ? Promise.resolve([])
    : computeRouteMatrix(survivors.map(({ spot }) => spotPlace(spot)), [request.destination], 'TRANSIT', transitTime)));
  const transitBySurvivor = new Map(secondWave.result.map((element) => [element.originIndex, element]));
  const chains = survivors.flatMap(({ spot, drive }, index) => {
    const transit = transitBySurvivor.get(index);
    return transit === undefined ? [] : [chainCandidate(spot, drive, transit, context)];
  });

  logScreening({
    spots: spots.length,
    pruned: drivableSpots - survivors.length,
    elements: (canDrive ? driveDestinations.length : 0) + (canTransit ? 1 : 0) + survivors.length,
    firstWaveMs: firstWave.milliseconds,
    secondWaveMs: secondWave.milliseconds,
  });
  return [...chains, ...baselines];
}

export async function planTrip(userId: Types.ObjectId, user: User, request: PlanRequest): Promise<PlanResponse> {
  const now = new Date();
  const warnings: PlannerWarning[] = [];
  const canDrive = request.modes.includes('DRIVE');
  const canTransit = request.modes.includes('TRANSIT');
  const savedSpots: ParkingSpot[] = canDrive ? await getParkingSpots(userId) : [];
  const spots = canDrive && canTransit
    ? selectCandidates(request.origin, request.destination, savedSpots as CandidateSpot[])
    : [];

  if (canDrive && savedSpots.length === 0) warnings.push('NO_PARKING_SPOTS');
  if (canDrive && user.lastGasPrice === null) warnings.push('GAS_PRICE_MISSING');
  if (canDrive && user.vehicle === null) warnings.push('VEHICLE_MISSING');

  const costVsTime = request.costVsTime ?? user.costVsTime ?? DEFAULT_COST_VS_TIME;
  const candidates = await screenCandidates(spots, canDrive, canTransit, { request, user, now, costVsTime });

  const feasible = filterChains(candidates, now, user.timezone ?? 'UTC');
  const initialPicks = pickThree(feasible);
  const baselineDriveCostCents = candidates.find((candidate) => candidate.kind === 'DRIVE')?.costBreakdown.fuelCents ?? null;
  const initialDetails = await Promise.all(initialPicks.map((candidate) => getDetailedCandidate(
    candidate,
    candidate.label,
    request,
    user,
    now,
    costVsTime,
    baselineDriveCostCents,
  )));

  const selected: DetailedCandidate[] = [];
  const lateFallbacks: DetailedCandidate[] = [];
  const attempted = new Set(initialPicks.map((candidate) => candidate.spotId));

  for (const [index, picked] of initialPicks.entries()) {
    const detail = initialDetails[index];
    if (detail !== null && detail !== undefined && detail.option.lateByMinutes === 0) {
      selected.push(detail);
      continue;
    }
    if (detail !== null && detail !== undefined) lateFallbacks.push(detail);

    const alternatives = sortForLabel(
      feasible.filter((candidate) => !attempted.has(candidate.spotId) && candidate.lateByMinutes === 0),
      picked.label,
    );
    for (const replacement of alternatives) {
      attempted.add(replacement.spotId);
      const replacementDetail = await getDetailedCandidate(
        replacement,
        picked.label,
        request,
        user,
        now,
        costVsTime,
        baselineDriveCostCents,
      );
      if (replacementDetail === null) continue;
      if (replacementDetail.option.lateByMinutes === 0) {
        selected.push(replacementDetail);
        break;
      }
      lateFallbacks.push(replacementDetail);
    }
  }

  if (selected.length === 0 && lateFallbacks.length > 0) {
    lateFallbacks.sort((a, b) => Date.parse(a.option.arriveAt) - Date.parse(b.option.arriveAt));
    const earliest = lateFallbacks[0];
    if (earliest !== undefined) selected.push({ ...earliest, option: { ...earliest.option, label: 'FASTEST' } });
  }

  return { options: selected.map(({ option }) => option), warnings };
}