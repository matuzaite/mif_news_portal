import Sidebar from '@/components/Sidebar/Sidebar';
import NewsCarousel from '@/components/NewsCarousel/NewsCarousel';
import styles from './page.module.css';

// 1. IMPORTUOJAME TIESIOGIAI IŠ LIB FAILO
import { fetchNews } from '@/lib/news'; 

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  let news: any[] = [];
  try {
    // 2. KVIEČIAME FUNKCIJĄ TIESIOGIAI (Jokio fetch į localhost!)
    news = await fetchNews(); 
  } catch (e) {
    console.error("Duomenų gavimo klaida:", e);
  }

  return (
    <main className={styles.main}>
      <Sidebar />
      <div className={styles.contentArea}>
        <NewsCarousel initialItems={news} />
      </div>
    </main>
  );
}