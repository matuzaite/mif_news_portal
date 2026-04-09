import styles from './EventCard.module.scss';

export default function EventCard({ event }: { event: any }) {
  return (
    <div className={styles.card}>
      <div className={`${styles.date} brand-font`}>
        {event.date}
      </div>
      <h3 className={`${styles.title} brand-font`}>
        {event.title}
      </h3>
    </div>
  );
}
