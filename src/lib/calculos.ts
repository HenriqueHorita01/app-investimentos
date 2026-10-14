import type { Ativo, CdiDia, Finalidade, Movimentacao, Objetivo } from './tipos'
import { ehRendaVariavel } from './tipos'

/** Chave do destino "livre" (lançamentos sem objetivo). */
export const LIVRE = 'livre'

/** Parte de um ativo que pertence a um destino (livre ou um objetivo). */
export interface Parcela {
  /** Cotas (renda variável). 0 na renda fixa. */
  quantidade: number
  /** Custo dessa parte. */
  investido: number
  valorAtual: number
}

/** Posição consolidada de um ativo — regras da seção 4 do SPEC. */
export interface Posicao {
  quantidade: number
  /** Custo total das compras ÷ quantidade comprada. Resgate não altera. */
  custoMedio: number
  /** Custo da posição atual (quantidade × custo médio; renda fixa: aplicado líquido). */
  investido: number
  /** null quando não há cotação (renda variável) ou para renda fixa. */
  cotacao: number | null
  /** Renda variável: quantidade × última cotação. Renda fixa: saldo bruto pelo CDI. */
  valorAtual: number
  /** Valor atual − investido (renda fixa: rendimento bruto). */
  variacao: number
  /** variação ÷ investido (fração). */
  variacaoPercentual: number
  /** Σ dividendos + JCP recebidos. */
  proventos: number
  /** variação + proventos recebidos. */
  retornoTotal: number
  semCotacao: boolean
  /** Renda fixa sem cálculo automático (indexador diferente de CDI). */
  semRendimento: boolean
  /** Divisão por destino: LIVRE ou id do objetivo. */
  porDestino: Record<string, Parcela>
  /** Algum destino ficou negativo (resgate maior que o disponível). */
  inconsistente: boolean
}

const qtd = (m: Movimentacao) => Number(m.quantidade ?? 0)
const valor = (m: Movimentacao) => Number(m.valor_total ?? 0)
const destino = (m: Movimentacao) => m.objetivo_id ?? LIVRE
const EPS = 0.005

function ordenar(movs: Movimentacao[]) {
  return [...movs].sort((a, b) => (a.data === b.data ? a.criado_em.localeCompare(b.criado_em) : a.data < b.data ? -1 : 1))
}

export function calcularPosicao(
  ativo: Pick<Ativo, 'tipo' | 'indexador' | 'taxa' | 'vencimento'>,
  movs: Movimentacao[],
  ultimaCotacao: number | null,
  cdi: CdiDia[] = [],
): Posicao {
  const proventos = movs.filter((m) => m.tipo === 'dividendo' || m.tipo === 'jcp').reduce((s, m) => s + valor(m), 0)
  return ehRendaVariavel(ativo.tipo)
    ? rendaVariavel(movs, ultimaCotacao, proventos)
    : rendaFixa(ativo, ordenar(movs), cdi, proventos)
}

function rendaVariavel(movs: Movimentacao[], ultimaCotacao: number | null, proventos: number): Posicao {
  const cotas: Record<string, number> = {}
  let qtdComprada = 0
  let custoCompras = 0
  for (const m of movs) {
    const d = destino(m)
    if (m.tipo === 'aporte') {
      cotas[d] = (cotas[d] ?? 0) + qtd(m)
      qtdComprada += qtd(m)
      custoCompras += valor(m)
    } else if (m.tipo === 'resgate') {
      cotas[d] = (cotas[d] ?? 0) - qtd(m)
    } else if (m.tipo === 'ajuste') {
      cotas[d] = (cotas[d] ?? 0) + qtd(m)
    }
  }
  const custoMedio = qtdComprada > 0 ? custoCompras / qtdComprada : 0
  const preco = ultimaCotacao ?? custoMedio
  const porDestino: Record<string, Parcela> = {}
  let quantidade = 0
  let inconsistente = false
  for (const [d, q0] of Object.entries(cotas)) {
    const q = Math.round(q0 * 1e6) / 1e6
    if (q < 0) inconsistente = true
    quantidade += q
    if (q !== 0) porDestino[d] = { quantidade: q, investido: q * custoMedio, valorAtual: q * preco }
  }
  quantidade = Math.round(quantidade * 1e6) / 1e6
  const investido = quantidade * custoMedio
  const valorAtual = quantidade * preco
  const variacao = valorAtual - investido
  return {
    quantidade,
    custoMedio,
    investido,
    cotacao: ultimaCotacao,
    valorAtual,
    variacao,
    variacaoPercentual: investido > 0 ? variacao / investido : 0,
    proventos,
    retornoTotal: variacao + proventos,
    semCotacao: ultimaCotacao == null,
    semRendimento: false,
    porDestino,
    inconsistente,
  }
}

/**
 * Renda fixa pós-fixada (% do CDI), SPEC §4:
 * fator do dia = 1 + CDI do dia × percentual; saldo = aplicado × Π fatores desde a aplicação.
 * Cada destino tem seu próprio saldo corrido, então o rendimento da parte reservada
 * fica no objetivo. O CDI do dia D vale para o dinheiro aplicado até D (inclusive).
 */
function rendaFixa(
  ativo: Pick<Ativo, 'indexador' | 'taxa' | 'vencimento'>,
  movs: Movimentacao[],
  cdi: CdiDia[],
  proventos: number,
): Posicao {
  const rende = ativo.indexador === 'cdi' && Number(ativo.taxa) > 0
  const percentual = Number(ativo.taxa ?? 0) / 100
  const saldos: Record<string, { saldo: number; custo: number }> = {}
  let inconsistente = false

  const aplicar = (m: Movimentacao) => {
    const d = destino(m)
    const s = (saldos[d] ??= { saldo: 0, custo: 0 })
    if (m.tipo === 'aporte') {
      s.saldo += valor(m)
      s.custo += valor(m)
    } else if (m.tipo === 'resgate' || m.tipo === 'amortizacao') {
      const r = valor(m)
      if (r > s.saldo + EPS) inconsistente = true
      // O custo sai na mesma proporção do saldo resgatado.
      s.custo -= s.saldo > 0 ? s.custo * Math.min(1, r / s.saldo) : 0
      s.saldo -= r
      if (Math.abs(s.saldo) < EPS) s.saldo = 0
    }
  }

  let i = 0
  if (rende && movs.length) {
    for (const dia of cdi) {
      if (dia.data < movs[0].data) continue
      if (ativo.vencimento && dia.data >= ativo.vencimento) break
      while (i < movs.length && movs[i].data <= dia.data) aplicar(movs[i++])
      const fator = 1 + (Number(dia.taxa_dia) / 100) * percentual
      for (const s of Object.values(saldos)) if (s.saldo > 0) s.saldo *= fator
    }
  }
  while (i < movs.length) aplicar(movs[i++])

  const porDestino: Record<string, Parcela> = {}
  let valorAtual = 0
  let investido = 0
  for (const [d, s] of Object.entries(saldos)) {
    valorAtual += s.saldo
    investido += s.custo
    if (Math.abs(s.saldo) >= EPS) porDestino[d] = { quantidade: 0, investido: s.custo, valorAtual: s.saldo }
  }
  const variacao = valorAtual - investido
  return {
    quantidade: 0,
    custoMedio: 0,
    investido,
    cotacao: null,
    valorAtual,
    variacao,
    variacaoPercentual: investido > 0 ? variacao / investido : 0,
    proventos,
    retornoTotal: variacao + proventos,
    semCotacao: false,
    semRendimento: !rende,
    porDestino,
    inconsistente,
  }
}

/** Quanto do destino está disponível para resgate (cotas na RV, reais na RF). */
export function disponivel(p: Posicao, rendaVariavel: boolean, dest: string): number {
  const parcela = p.porDestino[dest]
  if (!parcela) return 0
  return rendaVariavel ? parcela.quantidade : parcela.valorAtual
}

export interface ItemResumo {
  finalidade: Finalidade
  posicao: Posicao
}

export interface Resumo {
  /** Patrimônio = parte livre dos investimentos (sem objetivos e sem reserva de emergência). */
  patrimonio: number
  investido: number
  variacao: number
  variacaoPercentual: number
  /** Reservado para objetivos (conta como investimento, não como patrimônio). */
  reservado: number
  reservadoInvestido: number
  /** Reserva de emergência (aba própria, fora do patrimônio). */
  reservaEmergencia: number
  reservaInvestido: number
  proventos: number
}

export function resumir(itens: ItemResumo[]): Resumo {
  const r: Resumo = {
    patrimonio: 0,
    investido: 0,
    variacao: 0,
    variacaoPercentual: 0,
    reservado: 0,
    reservadoInvestido: 0,
    reservaEmergencia: 0,
    reservaInvestido: 0,
    proventos: 0,
  }
  for (const { finalidade, posicao: p } of itens) {
    r.proventos += p.proventos
    if (finalidade === 'reserva_emergencia') {
      r.reservaEmergencia += p.valorAtual
      r.reservaInvestido += p.investido
      continue
    }
    for (const [d, parcela] of Object.entries(p.porDestino)) {
      if (d === LIVRE) {
        r.patrimonio += parcela.valorAtual
        r.investido += parcela.investido
      } else {
        r.reservado += parcela.valorAtual
        r.reservadoInvestido += parcela.investido
      }
    }
  }
  r.variacao = r.patrimonio - r.investido
  r.variacaoPercentual = r.investido > 0 ? r.variacao / r.investido : 0
  return r
}

export interface UsoNoObjetivo {
  ativoId: string
  rotulo: string
  valorAtual: number
  investido: number
}

export interface ProgressoObjetivo {
  objetivo: Objetivo
  valorAtual: number
  investido: number
  /** valor atual ÷ valor-alvo (fração, pode passar de 1). */
  progresso: number
  ativos: UsoNoObjetivo[]
}

export function progressoObjetivos(
  objetivos: Objetivo[],
  ativos: { id: string; rotulo: string; posicao: Posicao }[],
): ProgressoObjetivo[] {
  return objetivos.map((o) => {
    const usos = ativos
      .filter((a) => a.posicao.porDestino[o.id])
      .map((a) => ({ ativoId: a.id, rotulo: a.rotulo, ...a.posicao.porDestino[o.id] }))
    const valorAtual = usos.reduce((s, u) => s + u.valorAtual, 0)
    const investido = usos.reduce((s, u) => s + u.investido, 0)
    return {
      objetivo: o,
      valorAtual,
      investido,
      progresso: o.valor_alvo > 0 ? valorAtual / o.valor_alvo : 0,
      ativos: usos.map(({ ativoId, rotulo, valorAtual, investido }) => ({ ativoId, rotulo, valorAtual, investido })),
    }
  })
}
