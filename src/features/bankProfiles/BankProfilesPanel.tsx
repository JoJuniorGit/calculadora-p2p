import { useState } from 'react';
import type { BankProfile, BankProfileDraft } from '../../domain/types';
import { formatPct, formatUsd } from '../../utils/format';
import { useAppStore } from '../../store/useAppStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { BankProfileForm } from './BankProfileForm';
import styles from './BankProfilesPanel.module.css';

function cardBaseLabel(base: BankProfile['cardCommissionBase']): string {
  return base === 'usd' ? 'Descontado de los USD' : 'Cobrado extra en Bs.S';
}

function interbankBaseLabel(base: BankProfile['interbankBase']): string {
  return base === 'initial'
    ? 'Sobre la inversión inicial'
    : 'Sobre los Bs.S netos post-intervención';
}

function igtfBaseLabel(base: BankProfile['igtfBase']): string {
  return base === 'card'
    ? 'Sobre el cargo de la tarjeta'
    : 'Sobre la inversión total en Bs.S';
}

export function BankProfilesPanel() {
  const profiles = useAppStore((state) => state.profiles);
  const addProfile = useAppStore((state) => state.addProfile);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const deleteProfile = useAppStore((state) => state.deleteProfile);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<BankProfile | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<BankProfile | null>(null);

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

  return (
    <section className={styles.panel} aria-labelledby="bank-profiles-title">
      <header className={styles.pageHeader}>
        <div>
          <h2 id="bank-profiles-title">Perfiles bancarios</h2>
          <p>Configura las comisiones que se aplican a cada banco.</p>
        </div>
        <Button onClick={openCreateForm}>Crear perfil</Button>
      </header>

      {profiles.length === 0 ? (
        <EmptyState
          title="Todavía no hay perfiles bancarios"
          description="Crea un perfil para guardar las comisiones y condiciones de tu banco."
          action={<Button onClick={openCreateForm}>Crear perfil</Button>}
        />
      ) : (
        <div className={styles.profileGrid}>
          {profiles.map((profile) => (
            <Card
              key={profile.id}
              title={profile.name}
              className={styles.profileCard}
              actions={
                <>
                  <Button variant="secondary" onClick={() => openEditForm(profile)}>
                    Editar
                  </Button>
                  <Button variant="dangerGhost" onClick={() => setProfileToDelete(profile)}>
                    Eliminar
                  </Button>
                </>
              }
            >
              <dl className={styles.commissionGrid}>
                <div className={styles.commissionTile}>
                  <dt className={styles.commissionLabel}>Tarjeta</dt>
                  <dd className={styles.commissionContent}>
                    <strong className={styles.commissionValue}>{formatPct(profile.cardCommissionPct)}</strong>
                    <span className={styles.commissionSubline}>
                      {cardBaseLabel(profile.cardCommissionBase)}
                    </span>
                  </dd>
                </div>
                <div className={styles.commissionTile}>
                  <dt className={styles.commissionLabel}>Binance</dt>
                  <dd className={styles.commissionContent}>
                    <strong className={styles.commissionValue}>
                      {formatPct(profile.binanceDepositPct)} + {formatUsd(profile.binanceDepositFixedUsd)}
                    </strong>
                    <span className={styles.commissionSubline}>Porcentaje más cargo fijo por depósito</span>
                  </dd>
                </div>
                <div className={styles.commissionTile}>
                  <dt className={styles.commissionLabel}>Interbancario</dt>
                  <dd className={styles.commissionContent}>
                    <span className={styles.commissionStatusValue}>
                      <Badge tone={profile.interbankEnabled ? 'success' : 'neutral'}>
                        {profile.interbankEnabled ? 'Activo' : 'Inactivo'}
                      </Badge>
                      <strong className={styles.commissionValue}>{formatPct(profile.interbankPct)}</strong>
                    </span>
                    <span className={styles.commissionSubline}>
                      {interbankBaseLabel(profile.interbankBase)}
                    </span>
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
                        <strong className={styles.commissionValue}>{formatPct(profile.slippagePct)}</strong>
                      </span>
                      <span className={styles.commissionSubline}>Ajuste sobre la tasa Binance P2P</span>
                    </dd>
                  </div>
                )}
              </dl>
              <div className={styles.notes}>
                <span className={styles.notesLabel}>Notas</span>
                <p>{profile.notes || 'Sin notas.'}</p>
              </div>
            </Card>
          ))}
        </div>
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
