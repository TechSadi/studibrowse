import type { Request, RequestHandler, Response } from 'express';
import type { AuthResponse, LoginData, MeResponse, SignupData } from '@studibrowse/shared';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './auth.cookies';
import * as authService from './auth.service';

type Params = Record<string, string>;

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

function sendSession(res: Response<AuthResponse>, session: authService.Session, status = 200): void {
  setRefreshCookie(res, session.refreshToken, session.persistent);
  res.status(status).json({ accessToken: session.accessToken, user: session.user });
}

export const signup: RequestHandler<Params, AuthResponse, SignupData> = async (req, res) => {
  sendSession(res, await authService.signup(req.body), 201);
};

export const login: RequestHandler<Params, AuthResponse, LoginData> = async (req, res) => {
  sendSession(res, await authService.login(req.body));
};

export const refresh: RequestHandler<Params, AuthResponse> = async (req, res) => {
  try {
    sendSession(res, await authService.refresh(readRefreshCookie(req)));
  } catch (error) {
    // A token that didn't work never will, so the browser shouldn't keep sending it.
    clearRefreshCookie(res);
    throw error;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  res.status(204).end();
};

export const me: RequestHandler<Params, MeResponse> = async (req, res) => {
  // requireAuth runs first, so userId is set.
  res.json({ user: await authService.getMe(req.userId!) });
};
