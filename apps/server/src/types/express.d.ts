// Express exposes its Request type for augmentation only through this global namespace.
declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      userId?: string;
    }
  }
}

export {};
