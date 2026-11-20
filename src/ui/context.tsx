import { createContext, useContext } from 'react'
import type { Data, User } from '../domain/model'
import type { OnlineCommand as Command } from '../data/contracts'
import type { Services } from '../data/contracts'

export const go = (path: string) => {
  window.location.hash = '/' + path
}
export const Context = createContext<{
  data: Data
  user: User
  services: Services
  busy: boolean
  run: (operation: () => Promise<void>, message?: string) => Promise<boolean>
  act: (command: Command, message?: string) => Promise<boolean>
} | null>(null)
export function useMoov() {
  const context = useContext(Context)
  if (!context) throw new Error('앱을 다시 열어 주세요.')
  return context
}
