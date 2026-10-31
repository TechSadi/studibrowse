import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResendEmailService, RESEND_API_URL } from './resendEmailService';
import { createEmailService } from './index';

const message = { to: 'alex@example.com', subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Resend email service', () => {
  it('posts the message to the Resend API with the key and sender', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await createResendEmailService({ apiKey: 're_123', from: 'StudiBrowse <a@b.c>' }).send(message);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RESEND_API_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer re_123' });
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'StudiBrowse <a@b.c>',
      to: ['alex@example.com'],
      subject: 'Hi',
      text: 'Hello',
      html: '<p>Hello</p>',
    });
  });

  it('throws when Resend rejects the email', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 422 })));
    const service = createResendEmailService({ apiKey: 're_123', from: 'a@b.c' });
    await expect(service.send(message)).rejects.toThrow(/422/);
  });
});

describe('createEmailService', () => {
  it('only sends real email in production', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const config = { RESEND_API_KEY: 're_123', EMAIL_FROM: 'a@b.c' };

    await createEmailService({ ...config, NODE_ENV: 'development' }).send(message);
    expect(fetchMock).not.toHaveBeenCalled();

    await createEmailService({ ...config, NODE_ENV: 'production' }).send(message);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
