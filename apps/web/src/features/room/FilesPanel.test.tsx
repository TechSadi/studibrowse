import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresenceMember, RoomResource } from '@studibrowse/shared';
import { ToastProvider } from '../../components/ui/Toast';
import { ApiError } from '../../lib/api';
import type { PendingUpload, RoomFiles } from './files/useRoomFiles';
import { FilesPanel } from './FilesPanel';

const ME = 'me';

const hana: PresenceMember = {
  userId: 'hana',
  name: 'Hana Ito',
  username: 'hana',
  avatarColor: 'green',
  status: 'break',
  workingOn: '',
  isHost: false,
  joinedAt: '2026-01-05T19:00:00.000Z',
  focusingSince: null,
};

const base = {
  roomId: 'room-1',
  size: null,
  fileName: null,
  downloadUrl: null,
  thumbnailUrl: null,
  createdAt: '2026-11-01T12:00:00.000Z',
};
const sheet: RoomResource = {
  ...base,
  id: 'r1',
  userId: ME,
  type: 'file',
  title: 'Linear algebra formula sheet',
  url: 'https://files.test/sheet.pdf',
  size: 1_887_437,
  fileName: 'formula sheet.pdf',
  downloadUrl: 'https://files.test/fl_attachment/sheet.pdf',
};
const playlist: RoomResource = {
  ...base,
  id: 'r2',
  userId: 'hana',
  type: 'link',
  title: '3Blue1Brown: Essence of linear algebra',
  url: 'https://www.youtube.com/playlist?list=abc',
};
const board: RoomResource = {
  ...sheet,
  id: 'r3',
  userId: 'hana',
  title: 'Whiteboard',
  url: 'https://files.test/board.png',
  size: 20_000,
  fileName: 'board.png',
  downloadUrl: 'https://files.test/fl_attachment/board.png',
  thumbnailUrl: 'https://files.test/thumb/board.png',
};

function roomFiles(overrides: Partial<RoomFiles> = {}): RoomFiles {
  return {
    uploads: [],
    shareLink: vi.fn().mockResolvedValue(undefined),
    upload: vi.fn().mockResolvedValue(undefined),
    cancelUpload: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderPanel({
  resources = [sheet, playlist, board],
  files = roomFiles(),
  isHost = false,
}: { resources?: RoomResource[]; files?: RoomFiles; isHost?: boolean } = {}) {
  render(
    <ToastProvider>
      <FilesPanel resources={resources} roomFiles={files} members={[hana]} myUserId={ME} isHost={isHost} />
    </ToastProvider>,
  );
  return files;
}

const row = (title: string) => screen.getByText(title).closest('li')!;
const linkInput = () => screen.getByRole('textbox', { name: 'Resource link' });
const titleInput = () => screen.getByRole('textbox', { name: 'Resource title' });

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('FilesPanel', () => {
  it('lists links and files newest first with who shared them', () => {
    renderPanel();
    const titles = screen
      .getAllByRole('listitem')
      .map((item) => within(item).getByText(/./, { selector: 'b' }).textContent);
    expect(titles).toEqual([
      'Whiteboard',
      '3Blue1Brown: Essence of linear algebra',
      'Linear algebra formula sheet',
    ]);
    expect(within(row('Linear algebra formula sheet')).getByText(/Shared by you/)).toBeDefined();
    expect(within(row('Linear algebra formula sheet')).getByText('1.8 MB')).toBeDefined();
    expect(within(row('3Blue1Brown: Essence of linear algebra')).getByText(/Shared by Hana/)).toBeDefined();
    expect(within(row('3Blue1Brown: Essence of linear algebra')).getByText('www.youtube.com')).toBeDefined();
  });

  it('shows a PDF tile, a URL tile and an image thumbnail', () => {
    renderPanel();
    expect(within(row('Linear algebra formula sheet')).getByText('PDF')).toBeDefined();
    expect(within(row('3Blue1Brown: Essence of linear algebra')).getByText('URL')).toBeDefined();
    const thumb = row('Whiteboard').querySelector('img');
    expect(thumb?.getAttribute('src')).toBe('https://files.test/thumb/board.png');
  });

  it('opens in a new tab and downloads files under their original name', () => {
    renderPanel();
    const open = screen.getByRole('link', { name: 'Open Linear algebra formula sheet' });
    expect(open.getAttribute('href')).toBe('https://files.test/sheet.pdf');
    expect(open.getAttribute('target')).toBe('_blank');
    expect(open.getAttribute('rel')).toBe('noopener noreferrer');

    const download = screen.getByRole('link', { name: 'Download formula sheet.pdf' });
    expect(download.getAttribute('href')).toBe('https://files.test/fl_attachment/sheet.pdf');
    expect(screen.queryByRole('link', { name: /^Download 3Blue1Brown/ })).toBeNull();
  });

  it('says files go when the room closes', () => {
    renderPanel();
    expect(
      screen.getByText('Files are deleted when the room closes, so download anything you want to keep.'),
    ).toBeDefined();
  });

  it('shows the empty state', () => {
    renderPanel({ resources: [] });
    expect(screen.getByText(/Nothing shared yet/)).toBeDefined();
  });

  it('shows × on your own things only, or on everything for the host', () => {
    renderPanel();
    expect(
      screen.getAllByRole('button', { name: /^Remove / }).map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Remove Linear algebra formula sheet']);
    cleanup();

    renderPanel({ isHost: true });
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(3);
  });

  it('removes and says why when refused', async () => {
    const files = renderPanel({
      files: roomFiles({
        remove: vi
          .fn()
          .mockRejectedValue(
            new ApiError(0, 'RESOURCE_NOT_FOUND', 'That isn’t in the room’s files any more.'),
          ),
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Linear algebra formula sheet' }));
    expect(files.remove).toHaveBeenCalledWith('r1');
    await waitFor(() => expect(screen.getByText('That isn’t in the room’s files any more.')).toBeDefined());
  });

  it('shares a link, defaulting the title to its host, and clears the form', async () => {
    const files = renderPanel();
    fireEvent.change(linkInput(), { target: { value: ' https://example.com/papers ' } });
    fireEvent.submit(linkInput().closest('form')!);

    await waitFor(() => expect((linkInput() as HTMLInputElement).value).toBe(''));
    expect(files.shareLink).toHaveBeenCalledWith('example.com', 'https://example.com/papers');
  });

  it('refuses a link that isn’t a full http(s) url', () => {
    const files = renderPanel();
    for (const value of ['example.com', 'javascript:alert(1)', 'ftp://example.com']) {
      fireEvent.change(linkInput(), { target: { value } });
      fireEvent.submit(linkInput().closest('form')!);
      expect(screen.getByRole('alert').textContent).toBe('Add a full link that starts with https://');
    }
    expect(files.shareLink).not.toHaveBeenCalled();
    expect(linkInput().getAttribute('aria-invalid')).toBe('true');
  });

  it('uploads a picked file with the typed title', async () => {
    const files = renderPanel();
    fireEvent.change(titleInput(), { target: { value: 'Week 3 slides' } });
    const file = new File(['x'], 'w3.pdf', { type: 'application/pdf' });
    const picker = document.querySelector('input[type="file"]')!;
    expect(picker.getAttribute('accept')).toContain('application/pdf');
    await act(async () => {
      fireEvent.change(picker, { target: { files: [file] } });
    });
    expect(files.upload).toHaveBeenCalledWith(file, 'Week 3 slides');
    expect((titleInput() as HTMLInputElement).value).toBe('');
  });

  it('shows uploads in progress with a cancel button', () => {
    const uploading: PendingUpload = { id: 'u1', name: 'w3.pdf', progress: 0.42 };
    const files = renderPanel({ resources: [], files: roomFiles({ uploads: [uploading] }) });
    const bar = screen.getByRole('progressbar', { name: 'Uploading w3.pdf' });
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(screen.getByText('Uploading · 42%')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel uploading w3.pdf' }));
    expect(files.cancelUpload).toHaveBeenCalledWith('u1');
  });
});
