import request from 'supertest';
import { ExpenseModel, GroupModel } from '../../src/groupStore';
import { initSplitSessionStore, SplitSessionModel } from '../../src/splitSessionStore';
import { splitSessionEvents } from '../../src/splitSessions';
import { mongoSessionStore, mongoUserStore } from '../../src/userStore';
import { databaseFailure, expectDatabaseError, failNextFindOne, useGroupApiFixture } from '../helpers/groupApiFixture';

// Mocked components: MongoDB split-session, expense and group model calls, and the session/user stores
// (spied to count lookups or to reject).
const fixture = useGroupApiFixture();
beforeAll(async () => { await initSplitSessionStore(); });
beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(async () => {
  jest.restoreAllMocks();
  await SplitSessionModel.deleteMany({});
});

const units = [{ unitId: 'burger-1', description: 'Burger', amountCents: 1200 }];
function start() {
  return request(fixture.app).post(`/api/groups/${fixture.groupId}/split-sessions`).set('Authorization', fixture.ownerAuth).send({
    reviewed: true, requestId: 'mock-split-request-01', description: 'Dinner', amountCents: 1200, paidBy: fixture.ownerId, units,
  });
}
function claim(sessionId: string, operationKey = 'mock-claim-000000001') {
  return request(fixture.app).post(`/api/split-sessions/${sessionId}/claims`).set('Authorization', fixture.memberAuth)
    .send({ unitId: 'burger-1', action: 'claim', version: 0, operationKey });
}
function finalize(sessionId: string) {
  return request(fixture.app).post(`/api/split-sessions/${sessionId}/finalize`).set('Authorization', fixture.ownerAuth)
    .send({ version: 1, operationKey: 'mock-final-000000001' });
}
async function startedSession() {
  const created = await start();
  expect(created.status).toBe(201);
  return created.body.session.id as string;
}
// Claims an item, applies `fail`, then looks the claim up; the lookup must fail closed.
async function lookUpClaimWhen(fail: () => void) {
  const sessionId = await startedSession();
  expect((await claim(sessionId)).status).toBe(200);
  fail();
  const response = await request(fixture.app).get('/api/operations/mock-claim-000000001').set('Authorization', fixture.memberAuth);
  expectDatabaseError(response);
  expect(response.body).not.toHaveProperty('operation');
}
// Counts the session, user and group reads behind one request.
function countLookups() {
  return [jest.spyOn(mongoSessionStore, 'find'), jest.spyOn(mongoUserStore, 'findById'), jest.spyOn(GroupModel, 'findOne')];
}

// Interface POST /api/groups/:groupId/split-sessions
describe('Mocked: POST /api/groups/:groupId/split-sessions', () => {
  // Input: an empty start request from the owner; mock: spies on the session, user and group lookups
  // Expected status code: 400
  // Expected behavior: authentication and membership are each read exactly once
  // Expected output: validation error
  test('Authenticates and reads membership once', async () => {
    const lookups = countLookups();
    const response = await request(fixture.app).post(`/api/groups/${fixture.groupId}/split-sessions`).set('Authorization', fixture.ownerAuth).send({});
    expect(response.status).toBe(400);
    for (const lookup of lookups) expect(lookup).toHaveBeenCalledTimes(1);
  });

  // Input: a valid reviewed start; mock: the session insert rejects
  // Expected status code: 500
  // Expected behavior: no session is stored or published
  // Expected output: { error: "Something went wrong. Please try again." }
  test('Stores nothing when the session insert fails', async () => {
    jest.spyOn(SplitSessionModel, 'create').mockRejectedValueOnce(databaseFailure());
    const publish = jest.spyOn(splitSessionEvents, 'emit');
    expectDatabaseError(await start());
    expect(await SplitSessionModel.countDocuments()).toBe(0);
    expect(publish).not.toHaveBeenCalled();
  });
});

// Interface GET /api/groups/:groupId/snapshot
describe('Mocked: GET /api/groups/:groupId/snapshot', () => {
  // Input: a snapshot request from the owner; mock: spies on the session, user and group lookups
  // Expected status code: 200
  // Expected behavior: authentication and membership are each read exactly once
  // Expected output: { splitSessions, expenses }
  test('Authenticates and reads membership once', async () => {
    const lookups = countLookups();
    const response = await request(fixture.app).get(`/api/groups/${fixture.groupId}/snapshot`).set('Authorization', fixture.ownerAuth);
    expect(response.status).toBe(200);
    for (const lookup of lookups) expect(lookup).toHaveBeenCalledTimes(1);
  });

  // Input: a snapshot request from a member; mock: the split-session query rejects
  // Expected status code: 500
  // Expected behavior: a failure is not reported as a group without sessions
  // Expected output: { error: "Something went wrong. Please try again." } without splitSessions
  test('Reports a failed session query instead of an empty snapshot', async () => {
    const query = SplitSessionModel.find();
    jest.spyOn(query, 'exec').mockRejectedValueOnce(databaseFailure());
    jest.spyOn(SplitSessionModel, 'find').mockReturnValueOnce(query);
    const response = await request(fixture.app).get(`/api/groups/${fixture.groupId}/snapshot`).set('Authorization', fixture.memberAuth);
    expectDatabaseError(response);
    expect(response.body).not.toHaveProperty('splitSessions');
  });
});

// Interface POST /api/split-sessions/:sessionId/claims
describe('Mocked: POST /api/split-sessions/:sessionId/claims', () => {
  // Input: a member claims an open item; mock: the conditional claim write rejects
  // Expected status code: 500
  // Expected behavior: the item stays unclaimed, the version is unchanged and nothing is published
  // Expected output: { error: "Something went wrong. Please try again." }
  test('Leaves the session unchanged when the claim write fails', async () => {
    const sessionId = await startedSession();
    const write = SplitSessionModel.findOneAndUpdate();
    jest.spyOn(write, 'exec').mockRejectedValueOnce(databaseFailure());
    jest.spyOn(SplitSessionModel, 'findOneAndUpdate').mockReturnValueOnce(write);
    const publish = jest.spyOn(splitSessionEvents, 'emit');
    expectDatabaseError(await claim(sessionId));
    const stored = await SplitSessionModel.findById(sessionId).lean();
    expect(stored?.version).toBe(0);
    expect(stored?.units[0]?.ownerId ?? null).toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });

  // Input: a member claims an item; mock: loading the split session rejects
  // Expected status code: 500
  // Expected behavior: no claim is attempted
  // Expected output: { error: "Something went wrong. Please try again." }
  test('Attempts no claim when the session cannot be loaded', async () => {
    const sessionId = await startedSession();
    const query = SplitSessionModel.findById(sessionId);
    jest.spyOn(query, 'exec').mockRejectedValueOnce(databaseFailure());
    jest.spyOn(SplitSessionModel, 'findById').mockReturnValueOnce(query);
    const write = jest.spyOn(SplitSessionModel, 'findOneAndUpdate');
    expectDatabaseError(await claim(sessionId));
    expect(write).not.toHaveBeenCalled();
  });
});

// Interface POST /api/split-sessions/:sessionId/finalize
describe('Mocked: POST /api/split-sessions/:sessionId/finalize', () => {
  // Input: a retry after finalization; mock: authorization reads the pre-finalization snapshot
  // Expected status code: 200 for identical details; 409 for a changed version
  // Expected behavior: a concurrent completion is replayed, but changed payloads are still rejected
  // Expected output: the original expense for a valid replay; one persisted expense/operation/event
  test.each([{ version: 1, status: 200 }, { version: 0, status: 409 }])(
    'Handles a stale authorization read with version $version', async ({ version, status }) => {
      const sessionId = await startedSession();
      expect((await claim(sessionId)).status).toBe(200);
      const stale = await SplitSessionModel.findById(sessionId);
      const completed = await finalize(sessionId);
      expect(completed.status).toBe(200);
      const query = SplitSessionModel.findById(sessionId);
      jest.spyOn(query, 'exec').mockResolvedValueOnce(stale);
      jest.spyOn(SplitSessionModel, 'findById').mockReturnValueOnce(query);
      const replay = await request(fixture.app).post(`/api/split-sessions/${sessionId}/finalize`)
        .set('Authorization', fixture.ownerAuth).send({ version, operationKey: 'mock-final-000000001' });
      expect(replay.status).toBe(status);
      if (status === 200) expect(replay.body.expense.id).toBe(completed.body.expense.id);
      else expect(replay.body).toHaveProperty('error');
      expect(await ExpenseModel.countDocuments({ splitSessionId: sessionId })).toBe(1);
      const stored = await SplitSessionModel.findById(sessionId).lean();
      expect(stored?.operations.filter(op => op.type === 'finalize')).toHaveLength(1);
      expect(stored?.events.filter(event => event.type === 'finalized')).toHaveLength(1);
    });

  // Input: the owner finalizes a fully claimed session twice; mock: the first expense insert rejects
  // Expected status code: 500, then 200
  // Expected behavior: the persisted finalize intent lets the retry post exactly one expense
  // Expected output: { session: { status: "finalized" }, expense } on retry
  test('Completes on retry after the expense insert fails', async () => {
    const sessionId = await startedSession();
    expect((await claim(sessionId)).status).toBe(200);
    jest.spyOn(ExpenseModel, 'create').mockRejectedValueOnce(databaseFailure());
    expectDatabaseError(await finalize(sessionId));
    expect((await SplitSessionModel.findById(sessionId).lean())?.status).toBe('finalizing');
    expect(await ExpenseModel.countDocuments({ splitSessionId: sessionId })).toBe(0);
    const retry = await finalize(sessionId);
    expect(retry.status).toBe(200);
    expect(retry.body.session.status).toBe('finalized');
    expect(await ExpenseModel.countDocuments({ splitSessionId: sessionId })).toBe(1);
  });

  // Input: the owner finalizes a fully claimed session; mock: the finalize lock write rejects
  // Expected status code: 500
  // Expected behavior: the session stays open and no expense is posted
  // Expected output: { error: "Something went wrong. Please try again." }
  test('Posts nothing when the finalize lock fails', async () => {
    const sessionId = await startedSession();
    expect((await claim(sessionId)).status).toBe(200);
    const lock = SplitSessionModel.findOneAndUpdate();
    jest.spyOn(lock, 'exec').mockRejectedValueOnce(databaseFailure());
    jest.spyOn(SplitSessionModel, 'findOneAndUpdate').mockReturnValueOnce(lock);
    expectDatabaseError(await finalize(sessionId));
    expect((await SplitSessionModel.findById(sessionId).lean())?.status).toBe('open');
    expect(await ExpenseModel.countDocuments({ splitSessionId: sessionId })).toBe(0);
  });
});

// Interface GET /api/operations/:operationKey
describe('Mocked: GET /api/operations/:operationKey', () => {
  // Input: the actor looks up a completed claim; mock: the operation query rejects
  // Expected status code: 500
  // Expected behavior: a failure is not reported as an unknown operation
  // Expected output: { error: "Something went wrong. Please try again." }
  test('Reports a failed lookup instead of a missing operation', async () => {
    await lookUpClaimWhen(() => failNextFindOne(SplitSessionModel));
  });

  // Input: the actor looks up a completed claim; mock: the group membership lookup rejects
  // Expected status code: 500
  // Expected behavior: the operation is not disclosed without a membership check
  // Expected output: { error: "Something went wrong. Please try again." }
  test('Discloses nothing when membership cannot be checked', async () => {
    await lookUpClaimWhen(() => failNextFindOne(GroupModel));
  });
});
