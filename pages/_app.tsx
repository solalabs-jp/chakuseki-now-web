import type { AppProps } from 'next/app';
import type { NextPage } from 'next';
import type { ReactElement, ReactNode } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import '../styles/globals.css';

type NextPageWithLayout = NextPage & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

export default function App({ Component, pageProps }: AppPropsWithLayout) {
  const getLayout = Component.getLayout ?? ((page: ReactElement) => <Layout>{page}</Layout>);
  return (
    <>
      <Head>
        <link rel="icon" href="/AppIcon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/AppIcon.png" />
      </Head>
      {getLayout(<Component {...pageProps} />)}
    </>
  );
}
