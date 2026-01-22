import type { DubDeskAPI } from './index'

declare global {
  interface Window {
    dubdesk: DubDeskAPI
  }
}
