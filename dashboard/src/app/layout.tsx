import './globals.css';
import React from 'react';

export const metadata = {
  title: 'Utkal Alumina IT Dashboard',
  description: 'NOC Console Real-Time Monitor for servers, networking, and service tickets',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
