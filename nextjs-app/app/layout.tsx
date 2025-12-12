import "./globals.css";

export const metadata = {
  title: "OTO-DIAL - VoIP/SMS Platform",
  description: "Google Voice alternative platform",
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

