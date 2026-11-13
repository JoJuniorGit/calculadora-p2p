import { Button } from './ui/Button';
import styles from './StorageErrorScreen.module.css';

export function StorageErrorScreen() {
  const retry = (): void => window.location.reload();

  return (
    <main className={styles.shell}>
      <section className={styles.card} role="alert" aria-live="assertive">
        <span className={styles.mark} aria-hidden="true">
          P2P
        </span>
        <h1>No se pudo abrir el almacenamiento local</h1>
        <p>
          Para evitar sobrescribir tus datos, la aplicación no se abrió. Cerrá
          otras pestañas de la app, verificá que el navegador tenga espacio
          disponible y volvé a intentar.
        </p>
        <p className={styles.hint}>
          Si el problema continúa, no borres los datos del navegador. Probá en
          otro navegador o restaurá una copia JSON de seguridad.
        </p>
        <div className={styles.actions}>
          <Button onClick={retry}>Reintentar</Button>
        </div>
      </section>
    </main>
  );
}
