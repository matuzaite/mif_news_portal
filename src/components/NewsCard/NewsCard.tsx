import Image from 'next/image';
import styles from './NewsCard.module.scss';

export default function NewsCard({ item }: { item: any }) {
  return (
    <div className={styles.card}>
      <div className={styles.imageContainer}>
        <div className={styles.backgroundImage}>
          <Image
            src={item.image}
            alt=""
            fill
            className={styles.blur}
            unoptimized={item.image.includes('images.unsplash.com')}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
        <Image
          src={item.image}
          alt={item.title}
          fill
          className={styles.mainImage}
          unoptimized={item.image.includes('images.unsplash.com')}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      </div>
      <div className={styles.content}>
        <span className={styles.date}>{item.date}</span>
        <h3 className={styles.title}>{item.title}</h3>
      </div>
    </div>
  );
}
