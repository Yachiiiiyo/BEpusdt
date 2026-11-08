import { Suspense, lazy } from 'react'
import { createHashRouter, Navigate, Outlet } from 'react-router'
import { AppLayout } from '@/layouts/app-layout'
import { AuthGuard } from '@/router/auth-guard'
import { Skeleton } from '@/components/ui/skeleton'

const LoginPage = lazy(() =>
  import('@/pages/login').then((m) => ({ default: m.LoginPage })),
)
const HomePage = lazy(() => import('@/pages/home'))
const WalletPage = lazy(() => import('@/pages/wallet'))
const OrderPage = lazy(() => import('@/pages/order'))
const CreateOrderPage = lazy(() => import('@/pages/create-order'))
const RateListPage = lazy(() => import('@/pages/rate-list'))
const RateSyntaxPage = lazy(() => import('@/pages/rate-syntax'))
const SweepPage = lazy(() => import('@/pages/sweep'))
const SystemBasePage = lazy(() => import('@/pages/system-base'))
const SystemRpcPage = lazy(() => import('@/pages/system-rpc'))
const AboutPage = lazy(() => import('@/pages/about'))
const ErrorPage = lazy(() =>
  import('@/pages/error').then((m) => ({ default: m.ErrorPage })),
)

/** 路由级骨架屏兜底 */
function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="loading">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </div>
  )
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
}

export const router = createHashRouter([
  {
    path: '/login',
    element: (
      <Lazy>
        <LoginPage />
      </Lazy>
    ),
  },
  {
    element: (
      <AuthGuard>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </AuthGuard>
    ),
    children: [
      { path: '/', element: <Navigate to="/home" replace /> },
      {
        path: '/home',
        element: (
          <Lazy>
            <HomePage />
          </Lazy>
        ),
      },
      {
        path: '/wallet',
        element: (
          <Lazy>
            <WalletPage />
          </Lazy>
        ),
      },
      {
        path: '/order',
        element: (
          <Lazy>
            <OrderPage />
          </Lazy>
        ),
      },
      {
        path: '/create-order',
        element: (
          <Lazy>
            <CreateOrderPage />
          </Lazy>
        ),
      },
      {
        path: '/rate/list',
        element: (
          <Lazy>
            <RateListPage />
          </Lazy>
        ),
      },
      {
        path: '/rate/syntax',
        element: (
          <Lazy>
            <RateSyntaxPage />
          </Lazy>
        ),
      },
      { path: '/rate', element: <Navigate to="/rate/list" replace /> },
      {
        path: '/sweep',
        element: (
          <Lazy>
            <SweepPage />
          </Lazy>
        ),
      },
      {
        path: '/system/base/base',
        element: (
          <Lazy>
            <SystemBasePage />
          </Lazy>
        ),
      },
      {
        path: '/system/rpc/rpc',
        element: (
          <Lazy>
            <SystemRpcPage />
          </Lazy>
        ),
      },
      {
        path: '/system',
        element: <Navigate to="/system/base/base" replace />,
      },
      {
        path: '/github-api-doc',
        element: (
          <Lazy>
            <AboutPage />
          </Lazy>
        ),
      },
      {
        path: '/401',
        element: (
          <Lazy>
            <ErrorPage kind="401" />
          </Lazy>
        ),
      },
      {
        path: '/500',
        element: (
          <Lazy>
            <ErrorPage kind="500" />
          </Lazy>
        ),
      },
      {
        path: '*',
        element: (
          <Lazy>
            <ErrorPage kind="404" />
          </Lazy>
        ),
      },
    ],
  },
])
