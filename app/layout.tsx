import './globals.css';
import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'La Mia Mamma Company Portal',
  description: 'Internal staff portal for La Mia Mamma Group',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-gray-50">
      <body className="flex min-h-screen flex-col bg-gray-50 text-gray-900 antialiased">
        {/* Global header on all pages */}
        <Header />

        {/* Main page content */}
        <main className="flex-1">
          {children}
        </main>

        {/* Global footer on all pages */}
        <Footer />
      </body>
    </html>
  );
}
