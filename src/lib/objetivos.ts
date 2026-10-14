import type { Objetivo } from './tipos'

/** Cores disponíveis para objetivos (contraste bom nos dois temas). */
export const CORES_OBJETIVO = ['#D9822B', '#2F5BD3', '#7C4DBD', '#C2416B', '#0E8A8A', '#8A6D1F']

export function corObjetivo(o: Pick<Objetivo, 'cor'>): string {
  return o.cor || 'var(--reservado)'
}
