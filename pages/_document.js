import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="theme-color" content="hsl(223, 14%, 10%)" />
        <meta
          name="description"
          content="Ibrahim Hasaan. I&apos;m a Computer Science and Mathematics Major graduating in Spring 2024 and I'm looking for an Internship and/or a Job!"
        />
      </Head>
      <body className="font-mono">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
