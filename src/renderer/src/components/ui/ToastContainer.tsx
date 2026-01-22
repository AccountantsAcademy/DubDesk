import { useUIStore } from '@renderer/stores/ui.store'
import type React from 'react'

export function ToastContainer(): React.JSX.Element | null {
  const toasts = useUIStore((state) => state.toasts)
  const removeToast = useUIStore((state) => state.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[2000] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg
            bg-chrome-surface border border-chrome-border
            animate-in slide-in-from-right-full duration-300
            ${
              toast.type === 'success'
                ? 'border-l-4 border-l-green-500'
                : toast.type === 'error'
                  ? 'border-l-4 border-l-red-500'
                  : toast.type === 'warning'
                    ? 'border-l-4 border-l-yellow-500'
                    : 'border-l-4 border-l-blue-500'
            }
          `}
        >
          {/* Icon */}
          <div
            className={`flex-shrink-0 ${
              toast.type === 'success'
                ? 'text-green-500'
                : toast.type === 'error'
                  ? 'text-red-500'
                  : toast.type === 'warning'
                    ? 'text-yellow-500'
                    : 'text-blue-500'
            }`}
          >
            {toast.type === 'success' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {toast.type === 'error' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            {toast.type === 'warning' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            )}
            {toast.type === 'info' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
          </div>

          {/* Message */}
          <span className="text-sm text-chrome-text">{toast.message}</span>

          {/* Close button */}
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="ml-2 text-chrome-muted hover:text-chrome-text"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
