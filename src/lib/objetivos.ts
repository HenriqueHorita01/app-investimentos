import { LIVRE, type Posicao } from './calculos'
import type { Objetivo } from './tipos'

/** Cores disponíveis para objetivos (contraste bom nos dois temas). */
export const CORES_OBJETIVO = ['#D9822B', '#2F5BD3', '#7C4DBD', '#C2416B', '#0E8A8A', '#8A6D1F']

export function corObjetivo(o: Pick<Objetivo, 'cor'>): string {
  return o.cor || 'var(--reservado)'
}

export type TipoDestino = 'livre' | 'reserva' | 'objetivo'

export interface ParteDestino {
  /** LIVRE ou id do objetivo/reserva. */
  chave: string
  tipo: TipoDestino
  nome: string
  cor: string
  valor: number
  /** Fração do valor atual do ativo (0–1). */
  fracao: number
}

/**
 * Divide o valor atual de um ativo entre os destinos (livre, reserva de emergência e
 * objetivos), em ordem: objetivos (maior primeiro), reserva, livre.
 */
export function partesDoAtivo(p: Posicao, objetivos: Objetivo[], reserva: Objetivo | null): ParteDestino[] {
  return partesDeDestinos(p.porDestino, objetivos, reserva)
}

/** Soma os destinos de vários ativos (visão da carteira inteira). */
export function somarDestinos(posicoes: Posicao[]): Record<string, { valorAtual: number }> {
  const soma: Record<string, { valorAtual: number }> = {}
  for (const p of posicoes) {
    for (const [d, x] of Object.entries(p.porDestino)) (soma[d] ??= { valorAtual: 0 }).valorAtual += x.valorAtual
  }
  return soma
}

export function partesDeDestinos(
  porDestino: Record<string, { valorAtual: number }>,
  objetivos: Objetivo[],
  reserva: Objetivo | null,
): ParteDestino[] {
  const total = Object.values(porDestino).reduce((s, x) => s + Math.max(0, x.valorAtual), 0)
  const ordem: Record<TipoDestino, number> = { objetivo: 0, reserva: 1, livre: 2 }
  return Object.entries(porDestino)
    .filter(([, x]) => x.valorAtual > 0.005)
    .map(([chave, x]): ParteDestino => {
      const base = { chave, valor: x.valorAtual, fracao: total > 0 ? x.valorAtual / total : 0 }
      if (chave === LIVRE) return { ...base, tipo: 'livre', nome: 'Investido', cor: 'var(--positivo)' }
      if (reserva && chave === reserva.id) return { ...base, tipo: 'reserva', nome: 'Reserva', cor: 'var(--emergencia)' }
      const o = objetivos.find((x) => x.id === chave)
      return { ...base, tipo: 'objetivo', nome: o?.nome ?? 'Objetivo', cor: o ? corObjetivo(o) : 'var(--reservado)' }
    })
    .sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || b.valor - a.valor)
}
