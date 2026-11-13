import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DndContextProps,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BankProfile, BankProfileDraft } from '../../domain/types';
import { DEFAULT_P2P_FIXED_FEE_USDT } from '../../domain/calculations';
import { formatPct, formatPctWithFixedUsd } from '../../utils/format';
import { useAppStore } from '../../store/useAppStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { InfoTooltip } from '../../components/ui/InfoTooltip';
import { Modal } from '../../components/ui/Modal';
import { BankProfileForm } from './BankProfileForm';
import styles from './BankProfilesPanel.module.css';

function cardBaseLabel(base: BankProfile['cardCommissionBase']): string {
  return base === 'usd' ? 'Descontado de los USD' : 'Cobrado extra en Bs.S';
}

function interbankBaseLabel(): string {
  return 'Sobre el monto con intervención (0,50%)';
}

function igtfBaseLabel(base: BankProfile['igtfBase']): string {
  return base === 'card'
    ? 'Sobre el cargo de la tarjeta'
    : 'Sobre la inversión total en Bs.S';
}

function GripIcon() {
  return (
    <svg width="16" height="24" viewBox="0 0 16 24" aria-hidden="true" focusable="false">
      <circle cx="4" cy="5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="5" r="1.6" fill="currentColor" />
      <circle cx="4" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="4" cy="19" r="1.6" fill="currentColor" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" />
    </svg>
  );
}

interface ProfileCardProps {
  profile: BankProfile;
  dragHandle: ReactNode;
  className?: string;
  overlay?: boolean;
  expanded: boolean;
  onToggleDetails?(): void;
  onEdit?(profile: BankProfile): void;
  onDelete?(profile: BankProfile): void;
}

function ProfileCard({
  profile,
  dragHandle,
  className,
  overlay = false,
  expanded,
  onToggleDetails,
  onEdit,
  onDelete,
}: ProfileCardProps) {
  const detailsId = useId();
  const showActions = Boolean(!overlay && onEdit && onDelete);
  const showToggle = Boolean(!overlay && onToggleDetails);
  const classes = [
    styles.profileCard,
    expanded ? '' : styles.profileCardCollapsed,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Card
      title={profile.name}
      leading={dragHandle}
      className={classes}
      actions={
        showToggle ? (
          <Button
            variant="ghost"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={onToggleDetails}
          >
            {expanded ? 'Ocultar detalles' : 'Ver detalles'}
          </Button>
        ) : undefined
      }
    >
      <div id={detailsId} hidden={!expanded}>
        <dl className={styles.commissionGrid}>
        <div className={styles.commissionTile}>
          <dt className={styles.commissionLabel}>Tarjeta</dt>
          <dd className={styles.commissionContent}>
            <strong className={styles.commissionValue}>
              {formatPct(profile.cardCommissionPct)}
            </strong>
            <span className={styles.commissionSubline}>
              {cardBaseLabel(profile.cardCommissionBase)}
            </span>
          </dd>
        </div>
        <div className={styles.commissionTile}>
          <dt className={styles.commissionLabel}>Binance</dt>
          <dd className={styles.commissionContent}>
            <strong className={styles.commissionValue}>
              {formatPctWithFixedUsd(
                profile.binanceDepositPct,
                Math.max(profile.binanceDepositFixedUsd, DEFAULT_P2P_FIXED_FEE_USDT),
              )}
            </strong>
            <span className={styles.commissionSubline}>
              {Math.max(profile.binanceDepositFixedUsd, DEFAULT_P2P_FIXED_FEE_USDT) > 0
                ? 'Porcentaje más cargo fijo mínimo por venta'
                : 'Porcentaje sobre el depósito'}
            </span>
          </dd>
        </div>
        <div className={styles.commissionTile}>
          <dt className={styles.commissionLabel}>Interbancario</dt>
          <dd className={styles.commissionContent}>
            <span className={styles.commissionStatusValue}>
              <Badge tone={profile.interbankEnabled ? 'success' : 'neutral'}>
                {profile.interbankEnabled ? 'Activo' : 'Inactivo'}
              </Badge>
              <strong className={styles.commissionValue}>
                {formatPct(profile.interbankPct)}
              </strong>
            </span>
            <span className={styles.commissionSubline}>{interbankBaseLabel()}</span>
          </dd>
        </div>
        {profile.igtfEnabled && (
          <div className={styles.commissionTile}>
            <dt className={styles.commissionLabel}>IGTF</dt>
            <dd className={styles.commissionContent}>
              <span className={styles.commissionStatusValue}>
                <Badge tone="success">Activo</Badge>
                <strong className={styles.commissionValue}>{formatPct(profile.igtfPct)}</strong>
              </span>
              <span className={styles.commissionSubline}>
                {igtfBaseLabel(profile.igtfBase)}
              </span>
            </dd>
          </div>
        )}
        {profile.slippageEnabled && (
          <div className={styles.commissionTile}>
            <dt className={styles.commissionLabel}>Slippage</dt>
            <dd className={styles.commissionContent}>
              <span className={styles.commissionStatusValue}>
                <Badge tone="success">Activo</Badge>
                <strong className={styles.commissionValue}>
                  {formatPct(profile.slippagePct)}
                </strong>
              </span>
              <span className={styles.commissionSubline}>
                Ajuste sobre la tasa Binance P2P
              </span>
            </dd>
          </div>
        )}
      </dl>
      <div className={styles.notes}>
        <span className={styles.notesLabel}>Notas</span>
        <p>{profile.notes || 'Sin notas.'}</p>
      </div>
      {showActions && (
        <div className={styles.profileActions}>
          <Button variant="secondary" onClick={() => onEdit?.(profile)}>
            Editar
          </Button>
          <Button variant="dangerGhost" onClick={() => onDelete?.(profile)}>
            Eliminar
          </Button>
        </div>
      )}
      </div>
    </Card>
  );
}

interface SortableProfileCardProps {
  profile: BankProfile;
  expanded: boolean;
  onToggleDetails(): void;
  onEdit(profile: BankProfile): void;
  onDelete(profile: BankProfile): void;
}

function SortableProfileCard({
  profile,
  expanded,
  onToggleDetails,
  onEdit,
  onDelete,
}: SortableProfileCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: profile.id });

  const style: CSSProperties = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  };
  const itemClasses = styles.sortableItem;
  const cardClasses = isDragging ? styles.profileCardDragging : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={itemClasses}
      data-profile-id={profile.id}
    >
      <ProfileCard
        profile={profile}
        className={cardClasses}
        expanded={expanded}
        onToggleDetails={onToggleDetails}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            className={styles.dragHandle}
            aria-label={`Reordenar perfil ${profile.name}`}
            title="Mantener presionado para reordenar"
            {...attributes}
            {...listeners}
          >
            <GripIcon />
          </button>
        }
      />
    </div>
  );
}

export function BankProfilesPanel() {
  const profiles = useAppStore((state) => state.profiles);
  const addProfile = useAppStore((state) => state.addProfile);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const moveProfile = useAppStore((state) => state.moveProfile);
  const deleteProfile = useAppStore((state) => state.deleteProfile);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<BankProfile | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<BankProfile | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [expandedProfileIds, setExpandedProfileIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleProfileDetails = (id: string): void => {
    setExpandedProfileIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const activeProfile =
    activeProfileId === null
      ? null
      : profiles.find((profile) => profile.id === activeProfileId) ?? null;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const profileName = (id: string | number): string =>
    profiles.find((profile) => profile.id === String(id))?.name ?? 'perfil';

  const accessibility: DndContextProps['accessibility'] = {
    screenReaderInstructions: {
      draggable:
        'Para reordenar un perfil, presioná Espacio o Enter. Usá las flechas para moverlo y Espacio para soltarlo. Presioná Escape para cancelar.',
    },
    announcements: {
      onDragStart({ active }) {
        return `Levantaste el perfil ${profileName(active.id)}.`;
      },
      onDragOver({ active, over }) {
        return over
          ? `El perfil ${profileName(active.id)} está sobre ${profileName(over.id)}.`
          : `El perfil ${profileName(active.id)} ya no está sobre una posición.`;
      },
      onDragEnd({ active, over }) {
        return over
          ? `Soltaste el perfil ${profileName(active.id)} sobre ${profileName(over.id)}.`
          : `Soltaste el perfil ${profileName(active.id)} fuera de la lista.`;
      },
      onDragCancel({ active }) {
        return `Cancelaste el reordenamiento del perfil ${profileName(active.id)}.`;
      },
    },
  };

  const handleDragStart = ({ active }: DragStartEvent): void => {
    setActiveProfileId(String(active.id));
  };

  const handleDragCancel = (): void => {
    setActiveProfileId(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    setActiveProfileId(null);
    if (!over || active.id === over.id) return;
    moveProfile(String(active.id), String(over.id));
  };

  const openCreateForm = (): void => {
    setEditingProfile(null);
    setFormOpen(true);
  };

  const openEditForm = (profile: BankProfile): void => {
    setEditingProfile(profile);
    setFormOpen(true);
  };

  const closeForm = (): void => {
    setFormOpen(false);
    setEditingProfile(null);
  };

  const saveProfile = (draft: BankProfileDraft): void => {
    if (editingProfile) {
      updateProfile(editingProfile.id, draft);
    } else {
      addProfile(draft);
    }
    closeForm();
  };

  const headerHelp =
    profiles.length > 1
      ? 'Configura las comisiones que se aplican a cada banco. Arrastrá desde el ícono de agarre para cambiar el orden del selector.'
      : 'Configura las comisiones que se aplican a cada banco.';

  return (
    <section className={styles.panel} aria-labelledby="bank-profiles-title">
      <header className={styles.pageHeader}>
        <span className={styles.headerSpacer} aria-hidden="true" />
        <div className={styles.titleRow}>
          <h2 id="bank-profiles-title">Perfiles bancarios</h2>
          <InfoTooltip
            label="Información sobre perfiles bancarios"
            content={headerHelp}
            align="center"
          />
        </div>
        {profiles.length > 0 ? (
          <Button onClick={openCreateForm}>Crear perfil</Button>
        ) : (
          <span className={styles.headerSpacer} aria-hidden="true" />
        )}
      </header>

      {profiles.length === 0 ? (
        <EmptyState
          title="Todavía no hay perfiles bancarios"
          description="Crea un perfil para guardar comisiones de tarjeta, depósito Binance, interbancario e IGTF. La calculadora usará esos costos automáticamente."
          action={<Button onClick={openCreateForm}>Crear perfil</Button>}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={accessibility}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={profiles.map((profile) => profile.id)}
            strategy={rectSortingStrategy}
          >
            <div className={styles.profileList}>
              {profiles.map((profile) => (
                <SortableProfileCard
                  key={profile.id}
                  profile={profile}
                  expanded={expandedProfileIds.has(profile.id)}
                  onToggleDetails={() => toggleProfileDetails(profile.id)}
                  onEdit={openEditForm}
                  onDelete={setProfileToDelete}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeProfile ? (
              <div className={styles.dragOverlayContent} aria-hidden="true">
                <ProfileCard
                  profile={activeProfile}
                  overlay
                  expanded={expandedProfileIds.has(activeProfile.id)}
                  className={styles.profileCardOverlay}
                  dragHandle={
                    <span className={styles.dragHandlePreview}>
                      <GripIcon />
                    </span>
                  }
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <Modal
        open={formOpen}
        title={editingProfile ? `Editar perfil: ${editingProfile.name}` : 'Crear perfil'}
        onClose={closeForm}
      >
        <BankProfileForm profile={editingProfile} onSave={saveProfile} onCancel={closeForm} />
      </Modal>

      <ConfirmDialog
        open={profileToDelete !== null}
        title="Eliminar perfil"
        message={
          profileToDelete
            ? `¿Eliminar el perfil "${profileToDelete.name}"? Las compras ya registradas conservan su snapshot.`
            : ''
        }
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={() => {
          if (profileToDelete) deleteProfile(profileToDelete.id);
          setProfileToDelete(null);
        }}
        onCancel={() => setProfileToDelete(null)}
      />
    </section>
  );
}
