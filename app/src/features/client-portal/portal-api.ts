// RED stub: types only, behavior lands in GREEN.
export type StepKind = 'bank_connect' | 'payroll_connect' | 'address' | 'upload' | 'signature' | 'intake'
export interface PortalStep { id: string; position: number; kind: StepKind; label: string; required: boolean; status: 'pending' | 'in_progress' | 'submitted' | 'approved' | 'rejected' }
export interface PortalState { firm_name: string; agent_display_name: string | null; status: string; opened_at: string | null; expires_at: string; steps: PortalStep[] }
export class PortalError extends Error { constructor(public status: number, public code: string) { super(code) } }
export const isPortalState = (_v: unknown): _v is PortalState => false
export const getState = async (): Promise<PortalState> => { throw new PortalError(0, 'stub') }
export const start = async (): Promise<{ opened_at: string }> => { throw new PortalError(0, 'stub') }
export const heartbeat = async (_b: unknown): Promise<string> => 'stub'
