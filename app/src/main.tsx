import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { ApiError } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { signOutEverywhere } from '@/lib/session'
import { DirectionProvider } from './context/direction-provider'
import { ThemeProvider } from './context/theme-provider'
// Generated Routes
import { routeTree } from './routeTree.gen'
// Styles
import './styles/index.css'

// A Worker 401 means the token is no longer accepted: sign out locally, leave the shell,
// then drop cached data (after navigating, so no mounted query refetches without a token).
async function endSession() {
  await signOutEverywhere('expired')
  await router.navigate({
    to: '/admin/sign-in',
    search: { redirect: window.location.pathname },
    replace: true,
  })
  queryClient.clear()
}

const onApiError = (error: unknown) =>
  handleServerError(error, () => void endSession())

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      // 4xx answers will not change on retry; a 401 must reach onApiError at once
      retry: (failureCount, error) =>
        !import.meta.env.DEV &&
        failureCount < 3 &&
        !(error instanceof ApiError && error.status < 500),
      refetchOnWindowFocus: import.meta.env.PROD,
      staleTime: 10 * 1000, // 10s
    },
    mutations: {
      onError: onApiError,
    },
  },
})

// Create a new router instance
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme='light'>
          <DirectionProvider>
            <RouterProvider router={router} />
          </DirectionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
