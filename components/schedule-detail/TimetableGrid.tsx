import styles from '../../styles/ScheduleDetail.module.css';
import { LocationIcon, PersonIcon, PlusIcon, TrashIcon } from './icons';
import { DAYS, type ApiPeriod, type ClassCell } from './types';

type TimetableGridProps = {
  periods: ApiPeriod[];
  timetable: ClassCell[][];
  onAddCell: (dayIdx: number, periodId?: string) => void;
  onDeleteCell: (scheduleId: string) => void;
};

export default function TimetableGrid({ periods, timetable, onAddCell, onDeleteCell }: TimetableGridProps) {
  return (
    <div className={styles.gridWrap}>
      {/* Day headers */}
      <div className={styles.gridRow}>
        <div className={styles.emptyCell} />
        {DAYS.map((d) => (
          <div key={d} className={styles.dayHeader}>{d}</div>
        ))}
      </div>

      {/* Timetable rows */}
      {timetable.map((row, rowIdx) => (
        <div key={periods[rowIdx]?.id ?? rowIdx} className={styles.gridRow}>
          <div className={styles.periodLabel}>{periods[rowIdx]?.period ?? rowIdx + 1}限</div>
          {row.map((cell, colIdx) => (
            <div key={colIdx} className={styles.cell}>
              {cell ? (
                <div className={styles.classCard}>
                  <div className={styles.cardTopRow}>
                    <span className={styles.periodBadge}>{cell.period}</span>
                    <button
                      type="button"
                      onClick={() => onDeleteCell(cell.scheduleId)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      aria-label="この授業を削除"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  <div className={styles.cardSubject}>{cell.subject}</div>
                  <div className={styles.cardMeta}>
                    <PersonIcon />
                    <span>{cell.teacher}</span>
                  </div>
                  {cell.room && (
                    <div className={styles.cardMeta}>
                      <LocationIcon />
                      <span>{cell.room}</span>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  className={styles.emptyCell2}
                  onClick={() => onAddCell(colIdx, periods[rowIdx]?.id)}
                >
                  <PlusIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
