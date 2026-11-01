import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { MAX_FILE_MB, RESOURCE_TITLE_MAX, type PresenceMember, type RoomResource } from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import iconButton from '../../components/ui/IconButton.module.css';
import { useToast } from '../../components/ui/Toast';
import { FILE_ACCEPT, type PendingUpload, type RoomFiles } from './files/useRoomFiles';
import styles from './panes.module.css';
import { firstName } from './people';

interface FilesPanelProps {
  resources: RoomResource[];
  roomFiles: RoomFiles;
  members: PresenceMember[];
  myUserId: string;
  /** The host can remove anything. */
  isHost: boolean;
}

const LINK_ERROR = 'Add a full link that starts with https://';

function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'Web link';
  }
}

/** A full http(s) link, as the mockup's form accepts, or null. */
function parseLink(text: string): URL | null {
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function FileTile({ resource }: { resource: RoomResource }) {
  if (resource.type === 'link') return <span className={`${styles.ftile} ${styles.link}`}>URL</span>;
  if (resource.thumbnailUrl) {
    return (
      <span className={styles.ftile}>
        <img className={styles.thumb} src={resource.thumbnailUrl} alt="" loading="lazy" />
      </span>
    );
  }
  return <span className={styles.ftile}>PDF</span>;
}

function UploadRow({ upload, onCancel }: { upload: PendingUpload; onCancel: () => void }) {
  const percent = Math.round(upload.progress * 100);
  return (
    <li className={styles.res}>
      <span className={styles.ftile}>
        <Icon name="file" />
      </span>
      <div className={styles.grow}>
        <b>{upload.name}</b>
        <div
          className={`${styles.barTrack} ${styles.uploadBar}`}
          role="progressbar"
          aria-label={`Uploading ${upload.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <i style={{ width: `${percent}%` }} />
        </div>
        <small className="num">Uploading · {percent}%</small>
      </div>
      <button
        type="button"
        className={styles.remove}
        aria-label={`Cancel uploading ${upload.name}`}
        onClick={onCancel}
      >
        <Icon name="x" />
      </button>
    </li>
  );
}

/**
 * The Files tab (mockup `data-pane="res"`): links and files shared in the room, newest first. Anyone in the
 * room can share; whoever shared something or the host can remove it. Files go when the room closes.
 */
export function FilesPanel({ resources, roomFiles, members, myUserId, isHost }: FilesPanelProps) {
  const { uploads, shareLink, upload, cancelUpload, remove } = roomFiles;
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);

  const names = new Map(members.map((member) => [member.userId, firstName(member.name)]));
  const sharedBy = (userId: string) =>
    userId === myUserId ? 'you' : (names.get(userId) ?? 'someone who left');
  const newestFirst = [...resources].reverse();

  function refused(err: unknown) {
    const detail = err instanceof Error ? err.message : 'Something went wrong. Try again.';
    toast({ icon: 'file', title: 'That didn’t go through', detail });
  }

  async function onShareLink(event: FormEvent) {
    event.preventDefault();
    const url = parseLink(link.trim());
    if (!url) {
      setLinkError(LINK_ERROR);
      return;
    }
    setLinkError(null);
    setSharing(true);
    try {
      await shareLink(title.trim() || url.hostname, url.href);
      setTitle('');
      setLink('');
    } catch (err) {
      refused(err);
    } finally {
      setSharing(false);
    }
  }

  function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear it so picking the same file again still fires a change.
    event.target.value = '';
    if (!file) return;
    const fileTitle = title.trim();
    setTitle('');
    upload(file, fileTitle).catch(refused);
  }

  function onRemove(resource: RoomResource) {
    setRemoving((current) => new Set(current).add(resource.id));
    remove(resource.id)
      .catch(refused)
      .finally(() =>
        setRemoving((current) => {
          const next = new Set(current);
          next.delete(resource.id);
          return next;
        }),
      );
  }

  const canRemove = (resource: RoomResource) => isHost || resource.userId === myUserId;
  const empty = resources.length === 0 && uploads.length === 0;

  return (
    <>
      <div className={styles.scroll}>
        <p className={styles.filesNote}>
          Files are deleted when the room closes, so download anything you want to keep.
        </p>
        {empty ? (
          <p className="muted">Nothing shared yet. Links and files posted here stay until the room closes.</p>
        ) : (
          <ul className={styles.files} aria-label="Shared files and links">
            {uploads.map((item) => (
              <UploadRow key={item.id} upload={item} onCancel={() => cancelUpload(item.id)} />
            ))}
            {newestFirst.map((resource) => (
              <li
                key={resource.id}
                className={removing.has(resource.id) ? `${styles.res} ${styles.pending}` : styles.res}
              >
                <FileTile resource={resource} />
                <div className={styles.grow}>
                  <b>{resource.title}</b>
                  <small>
                    Shared by {sharedBy(resource.userId)} ·{' '}
                    <span className={resource.size === null ? undefined : 'num'}>
                      {resource.size === null ? hostOf(resource.url) : sizeText(resource.size)}
                    </span>
                  </small>
                </div>
                <div className={styles.resActions}>
                  <a
                    className={`${iconButton.iconBtn} ${styles.open}`}
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${resource.title}`}
                  >
                    <Icon name="ext" />
                  </a>
                  {resource.downloadUrl ? (
                    <a
                      className={`${iconButton.iconBtn} ${styles.open}`}
                      href={resource.downloadUrl}
                      download={resource.fileName ?? true}
                      aria-label={`Download ${resource.fileName ?? resource.title}`}
                    >
                      <Icon name="download" />
                    </a>
                  ) : null}
                  {canRemove(resource) ? (
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Remove ${resource.title}`}
                      disabled={removing.has(resource.id)}
                      onClick={() => onRemove(resource)}
                    >
                      <Icon name="x" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.foot}>
        <form className={styles.resForm} onSubmit={(event) => void onShareLink(event)} noValidate>
          <input
            className={styles.field}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title, e.g. Lecture 9 slides"
            aria-label="Resource title"
            autoComplete="off"
            maxLength={RESOURCE_TITLE_MAX}
          />
          <div className={styles.inlineForm}>
            <input
              className={styles.field}
              value={link}
              onChange={(event) => {
                setLink(event.target.value);
                if (linkError) setLinkError(null);
              }}
              placeholder="https://…"
              aria-label="Resource link"
              aria-invalid={linkError ? true : undefined}
              aria-describedby={linkError ? 'res-link-error' : undefined}
              inputMode="url"
              autoComplete="off"
            />
            <Button type="submit" size="sm" className={styles.addBtn} disabled={sharing}>
              Share
            </Button>
          </div>
          {linkError ? (
            <div id="res-link-error" className={styles.err} role="alert">
              {linkError}
            </div>
          ) : null}
          <div className={styles.uploadLine}>
            <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
              <Icon name="file" />
              Upload a file
            </Button>
            <small>PDF or image, up to {MAX_FILE_MB} MB</small>
            <input
              ref={fileInput}
              type="file"
              accept={FILE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={onPickFile}
            />
          </div>
        </form>
      </div>
    </>
  );
}
