import styles from './Header.module.scss';

export default function Header() {
  return (
    <header className={styles.header}>
      <img src="/logo.png" alt="VU Logo" className={styles.logo} />
      <nav className={styles.nav}>
        <a href="#" className={styles.navLink}>Naujienos</a>
        <a href="#" className={styles.navLink}>Apie fakultetą</a>
        <a href="#" className={styles.navLink}>Studijos</a>
        <a href="#" className={styles.navLink}>Mokslas</a>
      </nav>
    </header>
  );
}
