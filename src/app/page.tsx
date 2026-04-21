import Sidebar from '@/components/Sidebar/Sidebar';
import NewsCarousel from '@/components/NewsCarousel/NewsCarousel';
import styles from './page.module.css';
import { fetchNews } from '@/lib/news';

export default async function Home() {
    const news = await fetchNews();

  return (
    <main className={styles.main}>
      <Sidebar />
      <div className={styles.contentArea}>
        <NewsCarousel initialItems={news} />
      </div>
    </main>
  );
}