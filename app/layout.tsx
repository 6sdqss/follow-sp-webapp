export const metadata = { title: "FOLLOW SP ONWEB" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, background: "#F8F9FA" }}>{children}</body>
    </html>
  );
}
