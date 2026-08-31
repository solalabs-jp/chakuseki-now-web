import styles from '../styles/AppDownloadButton.module.css';

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/MYBJyC29';

export default function AppDownloadButton() {
  return (
    <a
      className={styles.button}
      href={TESTFLIGHT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="iPhoneアプリのインストールはこちら"
    >
      <span className={styles.label}>iPhoneアプリのインストールはこちら</span>
    </a>
  );
}
