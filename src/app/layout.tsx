import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Noto_Sans_TC, Noto_Sans_JP, Noto_Sans_Thai, Noto_Sans_Arabic } from 'next/font/google'
import { headers } from 'next/headers'
import { ThemeProvider } from 'next-themes'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { THEME_IDS } from '@/lib/themes'
import { ThemeBackground } from '@/components/ui/theme-background'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cjk-tc',
  display: 'swap',
})

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cjk-jp',
  display: 'swap',
})

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-thai',
  display: 'swap',
})

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
})

function resolveMetadataBase(): URL {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.MC_PUBLIC_BASE_URL,
    process.env.APP_URL,
    process.env.MISSION_CONTROL_PUBLIC_URL,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  for (const candidate of candidates) {
    try {
      return new URL(candidate)
    } catch {
      // Ignore invalid URL values and continue fallback chain.
    }
  }

  // Prevent localhost fallback in production metadata when env is unset.
  return new URL('https://mission-control.local')
}

const metadataBase = resolveMetadataBase()
const isOrgOfClaws = metadataBase.hostname.includes('orgofclaws')

const brand = isOrgOfClaws
  ? {
      title: 'Org of Claws — AI Agent Team for Your Business',
      description:
        'Deploy your own AI agent team. Org of Claws orchestrates specialized AI agents that handle marketing, engineering, sales, and operations — so you can focus on growing your business.',
      siteName: 'Org of Claws',
    }
  : {
      title: 'Mission Control — AI Agent Orchestration Dashboard',
      description:
        'Open-source dashboard for AI agent orchestration. Manage agent fleets, dispatch tasks, track costs, and coordinate multi-agent workflows. Self-hosted, zero dependencies, SQLite-powered.',
      siteName: 'Mission Control',
    }

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: brand.title,
  description: brand.description,
  metadataBase,
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png', sizes: '256x256' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/icon.png'],
  },
  openGraph: {
    title: brand.title,
    description: brand.description,
    type: 'website',
    siteName: brand.siteName,
    // images provided by src/app/opengraph-image.tsx (dynamic)
  },
  twitter: {
    card: 'summary_large_image',
    title: brand.title,
    description: brand.description,
    // images provided by src/app/twitter-image.tsx (dynamic)
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: brand.siteName,
  },
  other: isOrgOfClaws
    ? { 'theme-color': '#dc2626' }
    : { 'theme-color': '#0d1117' },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const nonce = (await headers()).get('x-nonce') || undefined
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} className="dark" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/site.webmanifest" />
        {/* Blocking script to set 'dark' class before first paint, preventing FOUC.
            Content is a static string literal — no user input, no XSS vector. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'void';var light=['light','paper'];var h=document.documentElement;if(t==='system'){if(window.matchMedia('(prefers-color-scheme:dark)').matches){h.classList.add('dark')}else{h.classList.remove('dark')}}else if(light.indexOf(t)===-1){h.classList.add('dark')}else{h.classList.remove('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${notoSansTC.variable} ${notoSansJP.variable} ${notoSansThai.variable} ${notoSansArabic.variable} font-sans antialiased`} suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="void"
            themes={[...THEME_IDS, 'system']}
            enableSystem
            disableTransitionOnChange
          >
            <ThemeBackground />
            <div className="h-screen overflow-hidden bg-background text-foreground">
              {children}
            </div>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
