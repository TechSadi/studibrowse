import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportLoggedError } from './logger';
import { captureError } from './monitoring';

vi.mock('./monitoring', () => ({ captureError: vi.fn() }));

afterEach(() => {
  vi.mocked(captureError).mockClear();
});

const ERROR = 50;
const FATAL = 60;
const WARN = 40;

describe('reportLoggedError', () => {
  it('reports error logs that carry an err, with the other fields and the message', () => {
    const err = new Error('boom');
    reportLoggedError([{ err, roomId: 'r1' }, 'failed to advance a room timer'], ERROR);
    expect(captureError).toHaveBeenCalledWith(err, {
      roomId: 'r1',
      message: 'failed to advance a room timer',
    });
  });

  it('reports fatal logs too', () => {
    const err = new Error('crash');
    reportLoggedError([{ err }], FATAL);
    expect(captureError).toHaveBeenCalledWith(err, {});
  });

  it('ignores warnings, and error logs without an err', () => {
    reportLoggedError([{ err: new Error('slow') }, 'slow'], WARN);
    reportLoggedError(['[db] connection failed, retrying'], ERROR);
    reportLoggedError([{ roomId: 'r1' }, 'no error object'], ERROR);
    expect(captureError).not.toHaveBeenCalled();
  });
});
