import type { PresenceMember, RoomResource } from '@studibrowse/shared';
import { Icon } from '../../components/ui/Icon';
import iconButton from '../../components/ui/IconButton.module.css';
import styles from './panes.module.css';
import { firstName } from './people';

interface FilesPanelProps {
  resources: RoomResource[];
  members: PresenceMember[];
}

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

/** The Files tab (mockup `data-pane="res"`). Sharing links and files from here arrives with Phase 3. */
export function FilesPanel({ resources, members }: FilesPanelProps) {
  const names = new Map(members.map((member) => [member.userId, firstName(member.name)]));
  return (
    <div className={styles.scroll}>
      {resources.length === 0 ? (
        <p className="muted">Nothing shared yet. Links and files posted here stay until the room closes.</p>
      ) : (
        <ul className={styles.files}>
          {resources.map((resource) => (
            <li key={resource.id} className={styles.res}>
              <span className={resource.type === 'link' ? `${styles.ftile} ${styles.link}` : styles.ftile}>
                {resource.type === 'link' ? 'URL' : 'FILE'}
              </span>
              <div className={styles.grow}>
                <b>{resource.title}</b>
                <small>
                  Shared by {names.get(resource.userId) ?? 'someone who left'} ·{' '}
                  {resource.size === null ? hostOf(resource.url) : sizeText(resource.size)}
                </small>
              </div>
              <a
                className={`${iconButton.iconBtn} ${styles.open}`}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${resource.title}`}
              >
                <Icon name="arrow" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
