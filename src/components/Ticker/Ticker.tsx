import styles from './Ticker.module.scss';

export default function Ticker() {
  return (
    <div className={styles.ticker}>
      <div className={styles.tickerContent}>
        SVARBI INFORMACIJA: VU MIF naujienų portalas atsinaujino! • Registracija į pavasario semestro kursus jau prasidėjo • Nepamirškite pasitikrinti savo el. pašto • 
      </div>
    </div>
  );
}
