import { NonRetryableError } from '../../provider-error'
import type { BankProvider } from '../provider'

// shortcut: placeholder until 04-04 Task 2 fills the /transactions/sync cursor loop.
export const syncTransactions: BankProvider['syncTransactions'] = async () => {
  throw new NonRetryableError('not_implemented')
}
