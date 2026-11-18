import { type Request, type Response, Router} from 'express';
import { logout, refreshTokens } from '../auth/auth.service';
import { authedUserId, requireAuth } from '../auth/requireAuth';
import { parseRequest } from '../errors';
import {
    addEquipment,
    editEquipment,
    getEquipment,
    getProfile,
    login,
    removeEquipment,
    saveFcmToken,
} from './users.service';
import {
    createEquipmentSchema,
    equipmentIdSchema,
    fcmTokenSchema,
    loginSchema,
    refreshTokenSchema,
    updateEquipmentSchema,
} from './users.schemas';

export const usersRouter = Router();

usersRouter.post('/login', async (req: Request, res: Response) => {
    const { idToken } = parseRequest(loginSchema, req.body);
    const result = await login(idToken);

    const message = result.isNewUser ? 'New user created' : 'Login successful';
    res.status(result.isNewUser ? 201 : 200).json({
        message,
        username: result.username,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
    });
});

usersRouter.post('/refresh', async (req: Request, res: Response) => {
    const { refreshToken } = parseRequest(refreshTokenSchema, req.body);
    const tokens = await refreshTokens(refreshToken);
    res.status(200).json(tokens);
});

usersRouter.post('/logout', async (req: Request, res: Response) => {
    const { refreshToken } = parseRequest(refreshTokenSchema, req.body);
    await logout(refreshToken);
    res.sendStatus(204);
});

usersRouter.use('/equipment', requireAuth);

usersRouter.get('/equipment', async (req: Request, res: Response) => {
    const equipment = await getEquipment(authedUserId(req));
    res.status(200).json({ equipment });
});

usersRouter.post('/equipment', async (req: Request, res: Response) => {
    const body = parseRequest(createEquipmentSchema, req.body);
    const equipment = await addEquipment(authedUserId(req), body);
    res.status(201).json({ equipment });
});

usersRouter.patch('/equipment/:equipmentId', async (req: Request, res: Response) => {
    const equipmentId = parseRequest(equipmentIdSchema, req.params.equipmentId);
    const body = parseRequest(updateEquipmentSchema, req.body);
    const equipment = await editEquipment(authedUserId(req), equipmentId, body);
    res.status(200).json({ equipment });
});

usersRouter.delete('/equipment/:equipmentId', async (req: Request, res: Response) => {
    const equipmentId = parseRequest(equipmentIdSchema, req.params.equipmentId);
    await removeEquipment(authedUserId(req), equipmentId);
    res.sendStatus(204);
});

usersRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
    const user = await getProfile(authedUserId(req));
    res.status(200).json({ user });
});

usersRouter.put('/me/fcm-token', requireAuth, async (req: Request, res: Response) => {
    const { token } = parseRequest(fcmTokenSchema, req.body);
    await saveFcmToken(authedUserId(req), token);
    res.sendStatus(204);
});
