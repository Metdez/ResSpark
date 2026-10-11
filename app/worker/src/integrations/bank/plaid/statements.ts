import { NonRetryableError } from '../../provider-error'
import type { BankProvider } from '../provider'

// shortcut: placeholders until 04-04 Task 2 fills /statements/list, /download and /refresh.
export const listStatements: BankProvider['listStatements'] = async () => {
  throw new NonRetryableError('not_implemented')
}

export const downloadStatement: BankProvider['downloadStatement'] = async () => {
  throw new NonRetryableError('not_implemented')
}
