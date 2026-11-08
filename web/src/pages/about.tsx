import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, CircleHelp, GitFork, MessagesSquare, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

/** 二开仓库（本项目） */
const FORK_REPO = 'https://github.com/Yachiiiiyo/BEpusdt'
/** 原项目仓库（来源：go.mod module 路径、改名前的 README 与旧版 doc.vue） */
const UPSTREAM_REPO = 'https://github.com/v03413/BEpusdt'

interface DocLink {
  labelKey: string
  href: string
}

/** 原项目社区（旧版 doc.vue 中的 Telegram 群组与频道） */
const UPSTREAM_COMMUNITY: DocLink[] = [
  { labelKey: 'about.telegram-group', href: 'https://t.me/BEpusdtChat' },
  { labelKey: 'about.telegram-channel', href: 'https://t.me/BEpusdtChannel' },
]

/** 文档（跟随二开仓库） */
const DOC_LINKS: DocLink[] = [
  { labelKey: 'about.api-doc', href: `${FORK_REPO}/blob/main/docs/api/api.md` },
  { labelKey: 'about.third-party', href: `${FORK_REPO}/blob/main/docs/api/other.md` },
  { labelKey: 'about.trade-type-list', href: `${FORK_REPO}/blob/main/docs/trade-type.md` },
]

/** 常见问题（跟随二开仓库） */
const FAQ_LINKS: DocLink[] = [
  { labelKey: 'about.faq-server', href: `${FORK_REPO}/blob/main/docs/faq/server.md` },
  { labelKey: 'about.faq-bandwidth', href: `${FORK_REPO}/blob/main/docs/faq/bandwidth.md` },
  { labelKey: 'about.faq-login-reset', href: `${FORK_REPO}/blob/main/docs/faq/login-reset.md` },
  { labelKey: 'about.faq-chat-id', href: `${FORK_REPO}/blob/main/docs/faq/telegram-chat-id.md` },
  { labelKey: 'about.faq-rpc', href: `${FORK_REPO}/blob/main/docs/faq/rpc-endpoint.md` },
]

function ExternalAnchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-sm text-primary underline-offset-4 hover:underline"
    >
      {children}
    </a>
  )
}

/** 一个区块：标题 + 可选说明 + 内容 */
function Section({
  icon,
  title,
  badge,
  desc,
  children,
}: {
  icon: ReactNode
  title: string
  badge?: ReactNode
  desc?: string
  children: ReactNode
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground" aria-hidden="true">
              {icon}
            </span>
            <h2 className="text-base font-semibold">{title}</h2>
            {badge}
          </div>
          {desc && <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

/** 标签在上、链接在下的列表，条目之间用细线分隔 */
function LinkList({ items }: { items: { label: string; href: string; extra?: ReactNode }[] }) {
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
      {items.map((item) => (
        <li key={item.href} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
            {item.label}
            {item.extra}
          </span>
          <ExternalAnchor href={item.href}>{item.href}</ExternalAnchor>
        </li>
      ))}
    </ul>
  )
}

/** 说明文档页（旧版路径：/about/doc） */
export default function AboutPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t('menu.github-api-doc')}</h1>
        <p className="text-sm text-muted-foreground">{t('about.page-desc')}</p>
      </div>

      {/* 声明 */}
      <section
        aria-labelledby="about-notice-title"
        className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:p-5 dark:border-amber-900 dark:bg-amber-950/40"
      >
        <TriangleAlert
          className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400"
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-col gap-2">
          <h2 id="about-notice-title" className="text-base font-semibold">
            {t('about.notice-title')}
          </h2>
          <p className="text-sm leading-relaxed">{t('about.notice-fork')}</p>
          <p className="text-sm leading-relaxed">
            {t('about.notice-prefix')}{' '}
            <a
              href={`${FORK_REPO}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
            >
              {t('about.notice-issue')}
            </a>
            {t('about.notice-suffix')}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 项目地址 */}
        <Section icon={<GitFork className="size-4" />} title={t('about.repos-title')}>
          <LinkList
            items={[
              {
                label: t('about.fork-repo'),
                href: FORK_REPO,
                extra: <Badge>{t('about.badge-current')}</Badge>,
              },
              {
                label: t('about.upstream-repo'),
                href: UPSTREAM_REPO,
                extra: <Badge variant="secondary">{t('about.badge-upstream')}</Badge>,
              },
            ]}
          />
        </Section>

        {/* 原项目社区 */}
        <Section
          icon={<MessagesSquare className="size-4" />}
          title={t('about.community-title')}
          badge={<Badge variant="secondary">{t('about.badge-upstream')}</Badge>}
          desc={t('about.community-desc')}
        >
          <LinkList
            items={UPSTREAM_COMMUNITY.map((l) => ({ label: t(l.labelKey), href: l.href }))}
          />
        </Section>

        {/* 文档 */}
        <Section
          icon={<BookOpen className="size-4" />}
          title={t('about.docs-title')}
          desc={t('about.docs-desc')}
        >
          <LinkList items={DOC_LINKS.map((l) => ({ label: t(l.labelKey), href: l.href }))} />
        </Section>

        {/* 常见问题 */}
        <Section
          icon={<CircleHelp className="size-4" />}
          title={t('about.faq-title')}
          desc={t('about.docs-desc')}
        >
          <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
            {FAQ_LINKS.map((item) => (
              <li key={item.href} className="py-3 first:pt-0 last:pb-0">
                <ExternalAnchor href={item.href}>{t(item.labelKey)}</ExternalAnchor>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  )
}
