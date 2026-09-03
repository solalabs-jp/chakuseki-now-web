import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import styles from '../styles/UserProfileButton.module.css';

type CurrentUser = {
  uid: string;
  role: string;
  email: string;
  displayName: string;
  grade: string;
  className: string;
};

const fallbackUser: CurrentUser = {
  uid: 'teacher-001',
  role: 'teacher',
  email: 'teacher@example.com',
  displayName: 'Kota Nemoto',
  grade: '',
  className: '',
};

function UserCircleIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </svg>
  );
}

type UserProfileButtonProps = {
  /** 'icon': page-header avatar button (default). 'card': full name/role row used in the sidebar. */
  variant?: 'icon' | 'card';
  cardClassName?: string;
  avatarClassName?: string;
  textClassName?: string;
  nameClassName?: string;
  subClassName?: string;
};

export default function UserProfileButton({
  variant = 'icon',
  cardClassName,
  avatarClassName,
  textClassName,
  nameClassName,
  subClassName,
}: UserProfileButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<CurrentUser>(fallbackUser);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem('authUser');
      if (!raw) {
        setIsLoggedIn(false);
        return;
      }

      const parsed = JSON.parse(raw) as any;
      const roleValue = parsed.role ?? '';
      const displayNameValue =
        parsed.displayName;
      const gradeValue =
        parsed.grade;
      const classNameValue =
        parsed.className;

      setIsLoggedIn(true);
      setUser({
        uid: parsed.uid ?? fallbackUser.uid,
        role: roleValue === 'student' || roleValue === '学生' ? '学生' : '教員',
        email: parsed.email ?? fallbackUser.email,
        displayName:
          displayNameValue ||
          (roleValue === 'student' ? 'Student User' : fallbackUser.displayName),
        grade: gradeValue ?? fallbackUser.grade,
        className: classNameValue ?? fallbackUser.className,
      });
    } catch {
      setUser(fallbackUser);
    }
  }, []);

  const initials = useMemo(() => {
    const names = user.displayName.split(/\s+/).filter(Boolean);
    if (names.length === 0) {
      return 'U';
    }
    const first = names[0][0] ?? '';
    const last = names[names.length - 1][0] ?? '';
    return `${first}${last}`.toUpperCase();
  }, [user.displayName]);

  const subLabel = user.className ? `担任 ${user.className}` : user.role;

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('authUser');
      window.localStorage.removeItem('authToken');
    }
    setIsLoggedIn(false);
    setUser(fallbackUser);
    setIsOpen(false);
    router.push('/login');
  };

  return (
    <>
      {!isOpen ? (
        variant === 'card' ? (
          <button
            type="button"
            className={cardClassName}
            onClick={() => (isLoggedIn ? setIsOpen(true) : router.push('/login'))}
            aria-label={isLoggedIn ? 'ユーザー情報を表示' : 'ログインへ移動'}
          >
            <div className={avatarClassName}>{isLoggedIn ? initials : <UserCircleIcon />}</div>
            <div className={textClassName}>
              <span className={nameClassName}>
                {isLoggedIn ? user.displayName : 'ログインしてください'}
              </span>
              <span className={subClassName}>{isLoggedIn ? subLabel : ''}</span>
            </div>
          </button>
        ) : isLoggedIn ? (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setIsOpen(true)}
            aria-label="ユーザー情報を表示"
          >
            <div className={styles.triggerAvatar}>{initials}</div>
          </button>
        ) : (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => router.push('/login')}
            aria-label="ログインへ移動"
          >
            <UserCircleIcon />
          </button>
        )
      ) : null}

      {isOpen && mounted
        ? createPortal(
            <div className={styles.overlay} onClick={() => setIsOpen(false)}>
              <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
                <div className={styles.header}>
                  <div className={styles.avatar}>{initials}</div>
                  <div>
                    <div className={styles.name}>{user.displayName}</div>
                    <div className={styles.role}>{user.role}</div>
                  </div>
                </div>

                <div className={styles.body}>
                  <div className={styles.row}>
                    <span>メール</span>
                    <strong>{user.email}</strong>
                  </div>
                  <div className={styles.row}>
                    <span>ロール</span>
                    <strong>{user.role}</strong>
                  </div>
                  <div className={styles.row}>
                    <span>学年</span>
                    <strong>{user.grade || '未設定'}</strong>
                  </div>
                  <div className={styles.row}>
                    <span>クラス</span>
                    <strong>{user.className || '未設定'}</strong>
                  </div>
                </div>

                <div className={styles.actions}>
                  <button type="button" className={styles.button} onClick={() => setIsOpen(false)}>
                    閉じる
                  </button>
                  <button type="button" className={styles.logoutButton} onClick={handleLogout}>
                    ログアウト
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
