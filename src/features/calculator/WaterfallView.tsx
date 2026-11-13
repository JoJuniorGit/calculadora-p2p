import type { WaterfallKind, WaterfallLine } from '../../domain/types';
import { formatBs, formatUsd, formatUsdt } from '../../utils/format';
import styles from './WaterfallView.module.css';

interface WaterfallViewProps {
  lines: WaterfallLine[];
}

function getAmountClassName(amount: number | null, kind: WaterfallKind): string {
  const classNames = [styles.amount];

  if (amount !== null && amount < 0) {
    classNames.push(styles.negativeAmount);
  } else if (amount !== null && amount > 0 && kind === 'output') {
    classNames.push(styles.positiveOutput);
  }

  return classNames.join(' ');
}

export function WaterfallView({ lines }: WaterfallViewProps) {
  return (
    <div className={styles.tableViewport} tabIndex={0} aria-label="Tabla con desplazamiento horizontal">
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>
          Desglose por concepto en Bs.S, USD y USDT
        </caption>
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col">Monto en Bs.S</th>
            <th scope="col">Monto en USD/USDT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const hasNegativeAmount =
              (line.amountBs !== null && line.amountBs < 0) ||
              (line.amountUsd !== null && line.amountUsd < 0);
            const rowClassName = [
              styles.row,
              styles[line.kind],
              hasNegativeAmount ? styles.negativeRow : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <tr className={rowClassName} key={line.key}>
                <th scope="row" className={styles.concept}>
                  <span className={styles.label}>{line.label}</span>
                  {line.detail && <small className={styles.detail}>{line.detail}</small>}
                </th>
                <td className={getAmountClassName(line.amountBs, line.kind)}>
                  {line.amountBs === null ? '—' : formatBs(line.amountBs)}
                </td>
                <td className={getAmountClassName(line.amountUsd, line.kind)}>
                  {line.amountUsd === null
                    ? '—'
                    : line.unit === 'USDT'
                      ? formatUsdt(line.amountUsd)
                      : formatUsd(line.amountUsd)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
