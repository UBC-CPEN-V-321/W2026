import { AppError, commonErrors, type ErrorDefinition, mapPrismaErrors } from "../errors";
import { FriendshipStatus } from "../generated/prisma/enums";
import {
  acceptFriendRequest,
  createFriendRequest,
  deleteFriendship,
  fetchFriendRequests,
  fetchFriends,
  fetchFriendship,
} from "./friends.repository";

export const friendErrors = {
  SelfRequest: { status: 400, code: "SELF_REQUEST", message: "Cannot friend yourself" },
  AlreadyFriends: { status: 409, code: "ALREADY_FRIENDS", message: "Already friends" },
  RequestAlreadySent: { status: 409, code: "REQUEST_ALREADY_SENT", message: "Request already sent" },
  // Both users sent a request at the same time
  RequestAlreadyExists: { status: 409, code: "REQUEST_ALREADY_EXISTS", message: "Request already exists" },
  RequestNotFound: { status: 404, code: "FRIEND_REQUEST_NOT_FOUND", message: "Friend request not found" },
  FriendshipNotFound: { status: 404, code: "FRIENDSHIP_NOT_FOUND", message: "Friendship not found" },
} satisfies Record<string, ErrorDefinition>;

/**
 * Sends a friend request. If the other user already sent one to this user, it is accepted instead.
 * @param userId the user sending the request
 * @param otherUserId the user receiving the request
 * @returns the friendship's status: PENDING if the request was sent, ACCEPTED if the other user's was accepted
 * @throws AppError if the request is to the user themself, the users are already friends,
 * the request was already sent, or the other user does not exist
 */
export async function sendFriendRequest(userId: string, otherUserId: string) {
  if (userId === otherUserId) {
    throw new AppError(friendErrors.SelfRequest);
  }

  const existing = await fetchFriendship(userId, otherUserId);

  if (existing === null) {
    await mapPrismaErrors(createFriendRequest(userId, otherUserId), {
      P2002: friendErrors.RequestAlreadyExists,
      P2003: commonErrors.UserNotFound,
    });
    return FriendshipStatus.PENDING;
  }

  if (existing.status === FriendshipStatus.ACCEPTED) {
    throw new AppError(friendErrors.AlreadyFriends);
  }

  if (existing.requesterId === userId) {
    throw new AppError(friendErrors.RequestAlreadySent);
  }

  await acceptFriendRequest(otherUserId, userId);
  return FriendshipStatus.ACCEPTED;
}

/**
 * Accepts a pending friend request sent to this user
 * @param userId the user accepting the request
 * @param requesterId the user who sent the request
 * @throws AppError if there is no pending request from the requester to the user
 */
export async function acceptRequest(userId: string, requesterId: string): Promise<void> {
  const accepted = await acceptFriendRequest(requesterId, userId);
  if (!accepted) throw new AppError(friendErrors.RequestNotFound);
}

/**
 * Removes a friend, or declines or cancels a pending request, between two users
 * @param userId the user removing the friendship
 * @param otherUserId the other user of the friendship
 * @throws AppError if there is no friendship or request between the users
 */
export async function removeFriend(userId: string, otherUserId: string): Promise<void> {
  const removed = await deleteFriendship(userId, otherUserId);
  if (!removed) throw new AppError(friendErrors.FriendshipNotFound);
}

/**
 * Gets the accepted friends of a user
 * @param userId the user whose friends are requested
 * @returns the friends of the user
 */
export async function getFriends(userId: string) {
  return await fetchFriends(userId);
}

/**
 * Gets the pending friend requests a user has received and sent
 * @param userId the user whose requests are requested
 * @returns the incoming and outgoing requests
 */
export async function getFriendRequests(userId: string) {
  return await fetchFriendRequests(userId);
}
