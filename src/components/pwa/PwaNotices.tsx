import { InstallPrompt } from './InstallPrompt';
import { OfflineNotice } from './OfflineNotice';
import { UpdatePrompt } from './UpdatePrompt';
import styles from './pwa.module.css';

export function PwaNotices() {
  return (
    <div className={styles.notices}>
      <OfflineNotice />
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
}
