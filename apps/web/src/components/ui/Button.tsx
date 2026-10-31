import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';
import styles from './Button.module.css';

type Variant = 'primary' | 'ghost';
type Size = 'md' | 'lg' | 'sm';

interface StyleProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

function buttonClass({ variant = 'primary', size = 'md', block = false }: StyleProps, extra?: string) {
  return [styles.btn, styles[variant], size !== 'md' && styles[size], block && styles.block, extra]
    .filter(Boolean)
    .join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & StyleProps;

export function Button({ variant, size, block, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, block }, className)} {...rest} />;
}

type ButtonLinkProps = LinkProps & StyleProps;

/** A router link that looks like a button (for navigation CTAs). */
export function ButtonLink({ variant, size, block, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClass({ variant, size, block }, className)} {...rest} />;
}
