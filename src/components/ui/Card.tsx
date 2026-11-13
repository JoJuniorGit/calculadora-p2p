import { useId, type CSSProperties, type ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps {
  title?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Card({ title, leading, actions, children, className, style }: CardProps) {
  const titleId = useId();
  const hasTitle = title !== undefined && title !== null;
  const classes = [styles.card, className].filter(Boolean).join(' ');

  return (
    <section className={classes} style={style} aria-labelledby={hasTitle ? titleId : undefined}>
      {(hasTitle || leading || actions) && (
        <header className={styles.header}>
          {leading && <div className={styles.leading}>{leading}</div>}
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
