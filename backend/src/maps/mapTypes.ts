import type { TransportationMode } from "../users/userTypes";

export interface MapCoordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodedLocation {
  coordinates: MapCoordinates;
  formattedAddress: string;
  placeId: string;
  isApproximate: boolean;
}

export interface MapMarker {
  activityId: string;
  title: string;
  address: string;
  placeId: string;
  coordinates: MapCoordinates;
  isApproximate: boolean;
}

export interface UnmappedActivity {
  activityId: string;
  title: string;
  address: string;
}

export interface RouteStep {
  instruction: string;
}

export interface TravelOption {
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
}

export interface MapRoute {
  fromActivityId: string;
  toActivityId: string;
  transportationMode: TransportationMode;
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
  walking: TravelOption | null;
  driving: TravelOption | null;
}

export interface ItineraryMap {
  itineraryId: string;
  ownerId: string;
  itineraryUpdatedAt: string;
  markers: MapMarker[];
  routes: MapRoute[];
  unmappedActivities: UnmappedActivity[];
  generatedAt: string;
}
