import { Router, type Request, type Response } from "express";
import { authedUserId, requireAuth } from "../auth/requireAuth";
import { parseRequest } from "../errors";
import { friendRequestSchema, friendUserIdSchema } from "./friends.schemas";
import {
  acceptRequest,
  getFriendRequests,
  getFriends,
  getFriendsPageEvents,
  removeFriend,
  sendFriendRequest,
} from "./friends.service";
import { friendStreams } from "./friends.events";
import { streamRoute } from "../events/streamRoute";

export const friendsRouter = Router();

friendsRouter.use(requireAuth);

friendsRouter.get("/", async (req: Request, res: Response) => {
  const friends = await getFriends(authedUserId(req));
  res.status(200).json({ friends });
});

// Server-Sent Events stream of the caller's friends page: its current state first, then again each time the
// friends list, a friend's game in progress, or the pending requests change
friendsRouter.get(
  "/events",
  streamRoute(friendStreams, async (req) => {
    const userId = authedUserId(req);
    return { key: userId, firstEvents: await getFriendsPageEvents(userId) };
  }),
);

friendsRouter.delete("/", async (req: Request, res: Response) => {
  const otherUserId = parseRequest(friendUserIdSchema, req.query.userId);
  await removeFriend(authedUserId(req), otherUserId);
  res.sendStatus(204);
});

friendsRouter.get("/requests", async (req: Request, res: Response) => {
  const requests = await getFriendRequests(authedUserId(req));
  res.status(200).json(requests);
});

friendsRouter.post("/requests", async (req: Request, res: Response) => {
  const { userId } = parseRequest(friendRequestSchema, req.body);
  const status = await sendFriendRequest(authedUserId(req), userId);
  res.status(201).json({ status });
});

friendsRouter.post("/requests/accept", async (req: Request, res: Response) => {
  const { userId } = parseRequest(friendRequestSchema, req.body);
  await acceptRequest(authedUserId(req), userId);
  res.sendStatus(204);
});
