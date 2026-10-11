import { api, isObject } from '@/lib/api'
import {
  ESIGN_TEMPLATE_KEYS,
  type EsignTemplateKey,
} from '@/lib/esign-templates'

// Contracts of the Worker's /api/admin/esign routes (Plan 06-05), mirrored here.
export type EsignMappingValue = Record<EsignTemplateKey, number | null>

export interface EsignSettings {
  configured: boolean
  env: 'test' | 'production'
  mapping: EsignMappingValue
}

export interface EsignTemplate {
  id: number
  name: string
}

const isMapping = (v: unknown): v is EsignMappingValue =>
  isObject(v) &&
  ESIGN_TEMPLATE_KEYS.every((k) => v[k] === null || typeof v[k] === 'number')

export const isEsignSettings = (v: unknown): v is EsignSettings =>
  isObject(v) &&
  typeof v.configured === 'boolean' &&
  (v.env === 'test' || v.env === 'production') &&
  isMapping(v.mapping)

const isTemplates = (v: unknown): v is { templates: EsignTemplate[] } =>
  isObject(v) &&
  Array.isArray(v.templates) &&
  v.templates.every(
    (t) => isObject(t) && typeof t.id === 'number' && typeof t.name === 'string'
  )

const PATH = '/api/admin/esign'
export const ESIGN_SETTINGS_KEY = ['esign', 'settings']

export const getEsignSettings = () =>
  api(`${PATH}/settings`, {}, isEsignSettings)

export const listEsignTemplates = async () =>
  (await api(`${PATH}/templates`, {}, isTemplates)).templates

// Send only the changed keys; the Worker refuses an empty body or an unknown key.
export const saveEsignMapping = async (patch: Partial<EsignMappingValue>) =>
  (
    await api(
      `${PATH}/templates`,
      { method: 'PUT', body: JSON.stringify(patch) },
      (v): v is { mapping: EsignMappingValue } =>
        isObject(v) && isMapping(v.mapping)
    )
  ).mapping
