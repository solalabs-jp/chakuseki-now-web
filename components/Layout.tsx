import Sidebar from './Sidebar';
import AppDownloadButton from './AppDownloadButton';
import styles from '../styles/Layout.module.css';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
      <AppDownloadButton />
    </div>
  );
}
