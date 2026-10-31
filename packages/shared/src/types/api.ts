/** Body of every error response from the API. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface HealthResponse {
  ok: true;
  db: 'up' | 'down';
}
