import { ONBOARDING_SUBJECTS, STUDYING_MAX } from '@studibrowse/shared';
import { Avatar } from '../../components/ui/Avatar';
import { ChoiceChips } from '../../components/ui/ChoiceChips';
import { ColorSwatches } from '../../components/ui/ColorSwatches';
import { TextField } from '../../components/ui/Field';
import { avatarTone, initialsOf } from '../../lib/avatar';
import type { ProfileDraft } from './drafts';
import styles from './Onboarding.module.css';

interface ProfileStepProps {
  name: string;
  draft: ProfileDraft;
  onChange: (draft: ProfileDraft) => void;
}

export function ProfileStep({ name, draft, onChange }: ProfileStepProps) {
  // Keep subjects saved elsewhere (later, Settings) visible so saving here doesn't silently drop them.
  const subjectOptions = [...new Set([...ONBOARDING_SUBJECTS, ...draft.subjects])];
  return (
    <div className={styles.body}>
      <div className={styles.setAvatar}>
        <Avatar initials={initialsOf(name)} tone={avatarTone(draft.avatarColor)} size="lg" />
        <div>
          <span className={styles.lbl} id="onb-colour-label">
            Avatar colour
          </span>
          <ColorSwatches
            labelledBy="onb-colour-label"
            value={draft.avatarColor}
            onChange={(avatarColor) => onChange({ ...draft, avatarColor })}
          />
        </div>
      </div>
      <TextField
        id="onb-studying"
        label={
          <>
            What are you studying? <small>(optional)</small>
          </>
        }
        maxLength={STUDYING_MAX}
        placeholder="e.g. Computer Science, year 2"
        value={draft.studying}
        onChange={(e) => onChange({ ...draft, studying: e.target.value })}
      />
      <div>
        <span className={styles.lbl} id="onb-subjects-label">
          Subjects you usually study <small>(pick any)</small>
        </span>
        <ChoiceChips
          labelledBy="onb-subjects-label"
          options={subjectOptions}
          selected={draft.subjects}
          onChange={(subjects) => onChange({ ...draft, subjects })}
        />
      </div>
    </div>
  );
}
