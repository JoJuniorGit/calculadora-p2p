import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PurchaseStatus } from '../../domain/types';
import { PURCHASE_STATUS_LABELS } from '../../domain/purchases';
import styles from './PurchaseRowActions.module.css';

interface PurchaseRowActionsProps {
  purchaseLabel: string;
  nextStatus: PurchaseStatus | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onViewDetail(): void;
  onAdvance(): void;
  onDelete(): void;
}

interface MenuPosition {
  top: number;
  left: number;
}

export function PurchaseRowActions({
  purchaseLabel,
  nextStatus,
  open,
  onOpenChange,
  onViewDetail,
  onAdvance,
  onDelete,
}: PurchaseRowActionsProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const triggerId = useId();
  const menuId = useId();
  const [triggerVisible, setTriggerVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  onOpenChangeRef.current = onOpenChange;

  useLayoutEffect(() => {
    if (!open) {
      setTriggerVisible(false);
      setMenuPosition(null);
      return;
    }

    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    setTriggerVisible(triggerRect.width > 0 || triggerRect.height > 0);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerVisible) {
      setMenuPosition(null);
      return;
    }

    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportMargin = 8;
    const menuGap = 4;
    const maxLeft = Math.max(
      viewportMargin,
      window.innerWidth - menuRect.width - viewportMargin,
    );
    const left = Math.min(
      Math.max(triggerRect.right - menuRect.width, viewportMargin),
      maxLeft,
    );
    const spaceBelow = window.innerHeight - triggerRect.bottom - menuGap;
    const opensAbove = spaceBelow < menuRect.height;
    const maxTop = Math.max(
      viewportMargin,
      window.innerHeight - menuRect.height - viewportMargin,
    );
    const preferredTop = opensAbove
      ? triggerRect.top - menuRect.height - menuGap
      : triggerRect.bottom + menuGap;
    const top = Math.min(Math.max(preferredTop, viewportMargin), maxTop);

    setMenuPosition({ top, left });
  }, [nextStatus, open, triggerVisible]);

  useLayoutEffect(() => {
    if (!open || !menuPosition) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [menuPosition, open]);

  useEffect(() => {
    if (!open || !triggerVisible) return;

    const closeMenu = (returnFocus: boolean): void => {
      onOpenChangeRef.current(false);
      if (returnFocus) triggerRef.current?.focus();
    };

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeMenu(true);
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMenu(true);
    };

    const handleViewportChange = (): void => closeMenu(false);

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [open, triggerVisible]);

  const selectAction = (action: () => void): void => {
    onOpenChangeRef.current(false);
    action();
  };

  const advanceTitle = nextStatus
    ? nextStatus === 'completed'
      ? `Avanzar a ${PURCHASE_STATUS_LABELS[nextStatus]}. Abre el detalle para registrar la tasa real de venta antes de completar la operación.`
      : `Avanzar a ${PURCHASE_STATUS_LABELS[nextStatus]}`
    : undefined;

  const isLiquidation = nextStatus === 'completed';
  const quickActionLabel = isLiquidation ? 'Liquidar operación' : 'Avanzar estado';

  const handleQuickAction = (): void => {
    if (open) onOpenChangeRef.current(false);
    onAdvance();
  };

  const menu =
    open && triggerVisible && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className={styles.menu}
            role="menu"
            aria-labelledby={triggerId}
            data-positioned={menuPosition !== null}
            style={{ top: menuPosition?.top ?? 0, left: menuPosition?.left ?? 0 }}
          >
            <button
              className={styles.menuItem}
              type="button"
              role="menuitem"
              onClick={() => selectAction(onViewDetail)}
            >
              Ver detalle
            </button>
            {nextStatus !== null && (
              <button
                className={styles.menuItem}
                type="button"
                role="menuitem"
                title={advanceTitle}
                onClick={() => selectAction(onAdvance)}
              >
                Avanzar estado
              </button>
            )}
            <div className={styles.separator} role="separator" />
            <button
              className={`${styles.menuItem} ${styles.dangerItem}`}
              type="button"
              role="menuitem"
              onClick={() => selectAction(onDelete)}
            >
              Eliminar
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className={styles.actionGroup}>
        {nextStatus !== null && (
          <button
            className={styles.quickAction}
            type="button"
            title={quickActionLabel}
            aria-label={`${quickActionLabel} para ${purchaseLabel}`}
            data-kind={isLiquidation ? 'complete' : 'advance'}
            onClick={handleQuickAction}
          >
            {isLiquidation ? (
              <svg
                className={styles.icon}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M3.5 8.5l3 3 6-6" />
              </svg>
            ) : (
              <svg
                className={styles.icon}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M3 8h9" />
                <path d="M8.5 4.5L12 8l-3.5 3.5" />
              </svg>
            )}
          </button>
        )}
        <button
          ref={triggerRef}
          id={triggerId}
          className={styles.trigger}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`Acciones para ${purchaseLabel}`}
          title="Acciones"
          data-open={open}
          onClick={() => onOpenChange(!open)}
        >
          <svg
            className={styles.icon}
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="8" cy="3" r="1.25" />
            <circle cx="8" cy="8" r="1.25" />
            <circle cx="8" cy="13" r="1.25" />
          </svg>
        </button>
      </div>
      {menu}
    </>
  );
}
