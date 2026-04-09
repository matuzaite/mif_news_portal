import styles from './NewsCard.module.scss';

export default function NewsCard({ item }: { item: any }) {
  return (
    <div className={styles.card}>
      <div className={styles.imageContainer}>
        <div 
          className={styles.backgroundImage} 
          style={{ backgroundImage: `url(${item.image})` }} 
        />
        <img src={item.image} alt={item.title} className={styles.mainImage} />
      </div>
      <div className={styles.content}>
        <span className={styles.date}>{item.date}</span>
        <h3 className={styles.title}>{item.title}</h3>
      </div>
    </div>
  );
}
