import { useState, type FormEvent, type ReactElement } from "react";
import type { NextPage } from "next";
import { useRouter } from "next/router";
import styles from "../styles/Login.module.css";

type NextPageWithLayout = NextPage & { getLayout?: (page: ReactElement) => ReactElement };

const LoginPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError((data as { error?: string }).error ?? "ログインに失敗しました。" );
        return;
      }

      // resp = API の JSON
      const resp = data as any;
      const displayName = resp.displayName ?? resp.DisplayName ?? resp.display_name ?? resp.name ?? '';
      const grade = resp.grade ?? resp.gradeLevel ?? resp.grade_level ?? resp.year ?? '';
      const className = resp.className ?? resp.ClassName ?? resp.class ?? resp.class_id ?? resp.classId ?? '';

      localStorage.setItem("authToken", resp.idToken ?? "");
      localStorage.setItem(
        "authUser",
        JSON.stringify({
          uid: resp.uid ?? "",
          userId: resp.userId ?? null,
          role: resp.role ?? "student",
          email: resp.email ?? email,
          displayName,
          grade,
          className,
          expiresIn: resp.expiresIn ?? null,
        })
      );
      // ログイン成功後にルートへ遷移
      router.push("/");
    } catch {
      setError("通信に失敗しました。もう一度お試しください。" );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>着席なう</div>
        <h1 className={styles.title}>ログイン</h1>
        <p className={styles.subtitle}>教員用アカウントでサインインしてください。</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>メールアドレス</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className={styles.field}>
            <span>パスワード</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}

          <button type="submit" className={styles.button} disabled={isSubmitting}>
            {isSubmitting ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
};

LoginPage.getLayout = (page: ReactElement) => page;

export default LoginPage;
