import type { Request, RequestHandler, Response } from 'express';
import type {
  AuthResponse,
  ForgotPasswordData,
  ForgotPasswordResponse,
  GoogleAuthData,
  LoginData,
  MeResponse,
  ResetPasswordData,
  SignupData,
} from '@studibrowse/shared';
import type { EmailService } from '../../lib/email';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './auth.cookies';
import * as authService from './auth.service';
import type { GoogleVerifier } from './google';
import * as passwordResetService from './passwordReset.service';

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

/** Always 200, whether or not an account uses the email. */
export function createForgotPasswordHandler(
  emailService: EmailService,
): RequestHandler<Params, ForgotPasswordResponse, ForgotPasswordData> {
  return async (req, res) => {
    await passwordResetService.requestPasswordReset(req.body.email, emailService);
    res.json({ ok: true });
  };
}

export const resetPassword: RequestHandler<Params, unknown, ResetPasswordData> = async (req, res) => {
  await passwordResetService.resetPassword(req.body);
  res.status(204).end();
};

/** 201 when the Google account is new to us, so the client knows it just signed up. */
export function createGoogleHandler(
  verifyGoogleToken: GoogleVerifier,
): RequestHandler<Params, AuthResponse, GoogleAuthData> {
  return async (req, res) => {
    const session = await authService.signInWithGoogle(req.body, verifyGoogleToken);
    sendSession(res, session, session.created ? 201 : 200);
  };
}
