import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Brand PR Agent · 你的品牌公关顾问',
  description: '把公关方法论、团队知识与可信数据连接起来，获得有依据、可执行的品牌传播建议。',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
