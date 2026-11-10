import { useId, type ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, actions, children, className }: CardProps) {
  const titleId = useId();
  const hasTitle = title !== undefined && title !== null;
  const classes = [styles.card, className].filter(Boolean).join(' ');

  return (
    <section className={classes} aria-labelledby={hasTitle ? titleId : undefined}>
      {(hasTitle || actions) && (
        <header className={styles.header}>
          {hasTitle && (
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
          )}
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
