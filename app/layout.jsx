import '../styles.css';

export const metadata = {
  title: 'Movie Hub',
  description: 'A personal movie library, scraped from your chosen source.',
};

export default function RootLayout({ children }) {
  return <html lang="en" suppressHydrationWarning><head><link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap" rel="stylesheet" /></head><body suppressHydrationWarning>{children}</body></html>;
}
