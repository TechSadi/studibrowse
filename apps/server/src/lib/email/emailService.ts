export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends transactional email. Resend in production, the server log everywhere else. */
export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}
