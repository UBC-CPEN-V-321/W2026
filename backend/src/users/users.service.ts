import { issueTokens } from '../auth/auth.service';
import { AppError, commonErrors, type ErrorDefinition } from '../errors';
import { sendPush, type PushMessage } from '../external/fcm';
import { validateToken } from './helpers/validateToken';
import {
  addPreferredCourt as addPreferredCourtRecord,
  clearFcmTokens,
  createEquipment as createEquipmentRecord,
  createUser,
  getFcmTokens,
  getUserPhoto as getUserPhotoRecord,
  listPreferredCourts as listPreferredCourtsRecord,
  getUserByGoogleSub,
  getUserById,
  listEquipment as listEquipmentRecords,
  retireEquipment as retireEquipmentRecord,
  removePreferredCourt as removePreferredCourtRecord,
  saveFcmToken as saveFcmTokenRecord,
  updateEquipment as updateEquipmentRecord,
  updateUserPhotoUrl as updateUserPhotoUrlRecord,
} from './users.repository';
import type { CreateEquipmentInput, UpdateEquipmentInput } from './users.schemas';

export const userErrors = {
  InvalidGoogleToken: { status: 401, code: 'INVALID_GOOGLE_TOKEN', message: 'Invalid Google ID token' },
  InvalidGoogleProfile: {
    status: 400,
    code: 'INVALID_GOOGLE_PROFILE',
    message: 'Google profile must include name and email',
  },
  EquipmentNotFound: { status: 404, code: 'EQUIPMENT_NOT_FOUND', message: 'Equipment not found' },
} satisfies Record<string, ErrorDefinition>;

export interface LoginResult {
  isNewUser: boolean;
  username: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Validates a Google ID token, finds or creates the user, and issues tokens.
 * @param idToken The user's Google ID token
 * @returns Whether the user is new, their username and their tokens
 * @throws AppError 401 if the Google ID token is invalid, 400 if the Google profile has no name or email
 */
export async function login(idToken: string): Promise<LoginResult> {
  const payload = await validateToken(idToken);
 
  if (!payload?.sub) {
    throw new AppError(userErrors.InvalidGoogleToken);
  } 

  const existingUser = await getUserByGoogleSub(payload.sub);
  if (existingUser) {
    if (payload.picture !== undefined) {
      await updateUserPhotoUrlRecord(existingUser.id, payload.picture);
    }
    const tokens = await issueTokens(existingUser.id);
    return {
      isNewUser: false,
      username: existingUser.username,
      ...tokens,
    };
  }

   /*
   * Google guarantees the following will be returned with a payload:
   * googleSub
   * email
   * firstName
   * I have no idea why everything tells me that these may be null when they should not be, but 
   * I will guard against it anyways
   */

  const email = payload.email?.trim() ?? '';
  const name = payload.name?.trim() ?? '';
  if (!email || !name) {
    throw new AppError(userErrors.InvalidGoogleProfile);
  }

  // ai thinks that email may not be a unique indentifier, but google literally guarantees that all emails are unique...
  // it should be fine for now to use email as the username as a temporary measure
  const newUser = await createUser({
    googleSub: payload.sub,
    username: email, // temporary until user sets their username with onboarding
    name,
    email,
    photoUrl: payload.picture ?? null,
  });

  const tokens = await issueTokens(newUser.id);
  return {
    isNewUser: true,
    username: newUser.username,
    ...tokens,
  };
}

/**
 * Gets a user's profile, including their rating.
 * @param userId The signed-in user's ID
 * @returns The profile
 * @throws AppError 404 if the user does not exist
 */
export async function getProfile(userId: string) {
  const user = await getUserById(userId);
  if (!user) {
    throw new AppError(commonErrors.UserNotFound);
  }
  return user;
}

/**
 * Gets the signed-in user's photo URL.
 * @param userId The signed-in user
 * @returns The photo URL, or null when none is available
 * @throws AppError 404 if the user does not exist
 */
export async function getUserPhoto(userId: string): Promise<string | null> {
  const user = await getUserPhotoRecord(userId);
  if (!user) {
    throw new AppError(commonErrors.UserNotFound);
  }
  return user.photoUrl;
}

/**
 * Saves the device the user's push notifications go to.
 * @param userId The signed-in user's ID
 * @param token The device's FCM token
 */
export async function saveFcmToken(userId: string, token: string) {
  await saveFcmTokenRecord(userId, token);
}

/**
 * Throws the court-not-found error when a preferred-court write matched nothing.
 * Kept synchronous so the async callers below only await and then assert.
 * @param found The result of the repository write
 * @throws AppError 404 if the court was not found
 */
function assertCourtFound(found: unknown): asserts found {
  if (!found) {
    throw new AppError(commonErrors.CourtNotFound);
  }
}

/**
 * Adds a court to the signed-in user's preferred courts.
 * @param userId The signed-in user
 * @param courtId The court to add
 * @throws AppError 404 if the court does not exist
 */
export async function addPreferredCourt(userId: string, courtId: number): Promise<void> {
  const added = await addPreferredCourtRecord(userId, courtId);
  assertCourtFound(added);
}

/**
 * Removes a court from the signed-in user's preferred courts.
 * @param userId The signed-in user
 * @param courtId The court to remove
 * @throws AppError 404 if the court does not exist
 */
export async function removePreferredCourt(userId: string, courtId: number): Promise<void> {
  const removed = await removePreferredCourtRecord(userId, courtId);
  assertCourtFound(removed);
}

/**
 * Gets the signed-in user's preferred courts.
 * @param userId The signed-in user
 * @returns The user's preferred courts
 * @throws AppError 404 if the user does not exist
 */
export async function getPreferredCourts(userId: string) {
  const preferredCourts = await listPreferredCourtsRecord(userId);
  if (!preferredCourts) {
    throw new AppError(commonErrors.UserNotFound);
  }
  return preferredCourts;
}

/**
 * Sends one push notification to each user's device, and removes the tokens FCM says no longer exist.
 * @param userIds The users to notify; those without a device token are skipped
 * @param message The notification and the data the app reads when it is tapped
 * @returns How many devices the push reached
 */
export async function pushToUsers(userIds: string[], message: PushMessage): Promise<number> {
  const tokens = await getFcmTokens(userIds);
  const deadTokens = await sendPush(tokens, message);
  if (deadTokens.length > 0) {
    await clearFcmTokens(deadTokens);
  }
  return tokens.length - deadTokens.length;
}

/**
 * Lists active equipment belonging to the specified user.
 * @param userId The equipment owner's user ID
 * @returns The user's equipment records with their maintenance dates
 */
export async function getEquipment(userId: string) {
  return await listEquipmentRecords(userId);
}

/**
 * Adds equipment to the signed-in user's inventory.
 * @param userId The equipment owner
 * @param equipment The type, name, default status, and optional next maintenance date
 * @returns The created equipment record
 */
export async function addEquipment(userId: string, equipment: CreateEquipmentInput) {
  return await createEquipmentRecord(userId, {
    type: equipment.type,
    name: equipment.name,
    isDefault: equipment.isDefault ?? false,
    nextMaintenanceAt: equipment.nextMaintenanceAt ?? null,
  });
}

/**
 * Updates fields on the user's active equipment record.
 * @param userId The equipment owner
 * @param equipmentId The equipment record to update
 * @param equipment The validated fields to change
 * @returns The updated equipment
 * @throws AppError 404 if no matching active record exists
 */
export async function editEquipment(
  userId: string,
  equipmentId: number,
  equipment: UpdateEquipmentInput,
) {
  const updated = await updateEquipmentRecord(userId, equipmentId, {
    ...(equipment.type === undefined ? {} : { type: equipment.type }),
    ...(equipment.name === undefined ? {} : { name: equipment.name }),
    ...(equipment.isDefault === undefined ? {} : { isDefault: equipment.isDefault }),
    ...(equipment.nextMaintenanceAt === undefined ? {} : { nextMaintenanceAt: equipment.nextMaintenanceAt }),
  });
  if (!updated) {
    throw new AppError(userErrors.EquipmentNotFound);
  }
  return updated;
}

/**
 * Retires one of the user's active equipment records.
 * @param userId The equipment owner
 * @param equipmentId The equipment record to retire
 * @throws AppError 404 if no matching active record exists
 */
export async function removeEquipment(userId: string, equipmentId: number): Promise<void> {
  const retired = await retireEquipmentRecord(userId, equipmentId);
  if (!retired) throw new AppError(userErrors.EquipmentNotFound);
}