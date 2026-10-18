// Saldo líquido estimado para resgate (por investimento) e o valor manual que o usuário
// pode informar por cima dele. Funções puras.
import { tributacaoDoLote, type Posicao } from './calculos'
import type { Ativo, Movimentacao } from './tipos'
import { ehRendaVariavel } from './tipos'

/** Vendas de ações até R$ 20 mil no mês são isentas de IR para pessoa física. */
export const LIMITE_ISENCAO_ACOES = 20000

export interface Liquido {
  /** Principal ainda aplicado (custo restante). */
  investido: number
  /** Rendimento/ganho bruto acumulado (pode ser negativo). */
  rendimentoBruto: number
  ir: number
  iof: number
  /** Principal + rendimento bruto. */
  bruto: number
  /** Bruto − IR − IOF. */
  liquido: number
  /** Explica a regra de tributação usada. */
  regra: string
}

/**
 * Saldo líquido estimado de UM investimento se resgatado/vendido em `hoje`.
 * - Renda fixa: soma aplicação por aplicação (IR pelo prazo de cada uma, IOF < 30 dias;
 *   LCI/LCA isentas).
 * - Ações: 15% sobre o lucro; isento se a posição couber no limite de R$ 20 mil/mês.
 * - FIIs: 20% sobre o lucro na venda. ETFs: 15%, sem isenção.
 * Prejuízo não gera imposto. Dividendos já recebidos não entram (já são isentos e saíram).
 */
export function calcularLiquido(ativo: Pick<Ativo, 'tipo'>, posicao: Posicao, hoje: string): Liquido {
  if (!ehRendaVariavel(ativo.tipo)) {
    const isenta = ativo.tipo === 'lci_lca'
    let ir = 0
    let iof = 0
    let investido = 0
    let bruto = 0
    for (const l of posicao.lotes) {
      if (l.saldo <= 0.005) continue
      const t = tributacaoDoLote(l, hoje, isenta)
      ir += t.ir
      iof += t.iof
      investido += l.custo
      bruto += l.saldo
    }
    // Sem lotes (ex.: só ajustes): usa a posição.
    if (!posicao.lotes.length) {
      investido = posicao.investido
      bruto = posicao.valorAtual
    }
    return {
      investido,
      rendimentoBruto: bruto - investido,
      ir,
      iof,
      bruto,
      liquido: bruto - ir - iof,
      regra: isenta ? 'LCI/LCA: isenta de IR para pessoa física.' : 'IR regressivo pelo prazo de cada aplicação (22,5% a 15%) e IOF nos primeiros 30 dias.',
    }
  }

  const investido = posicao.investido
  const bruto = posicao.valorAtual
  const ganho = bruto - investido
  let aliquota = 0
  let regra = ''
  if (ativo.tipo === 'acao') {
    if (bruto <= LIMITE_ISENCAO_ACOES) {
      regra = 'Ações: venda de até R$ 20 mil no mês é isenta de IR (estimativa considerando só esta posição).'
    } else {
      aliquota = 0.15
      regra = 'Ações: 15% sobre o lucro (a venda passa de R$ 20 mil no mês).'
    }
  } else if (ativo.tipo === 'fii') {
    aliquota = 0.2
    regra = 'FII: 20% sobre o lucro na venda das cotas (dividendos seguem isentos).'
  } else {
    aliquota = 0.15
    regra = 'ETF: 15% sobre o lucro, sem a isenção de R$ 20 mil.'
  }
  const ir = ganho > 0 ? ganho * aliquota : 0
  return { investido, rendimentoBruto: ganho, ir, iof: 0, bruto, liquido: bruto - ir, regra }
}

/**
 * Resumo dos lançamentos do ativo: muda quando há novo aporte, resgate, edição ou
 * exclusão. Serve para avisar que um valor manual pode estar desatualizado.
 */
export function assinaturaLancamentos(movs: Movimentacao[]): string {
  const texto = [...movs]
    .map((m) => [m.id, m.data, m.tipo, Number(m.valor_total).toFixed(2), m.quantidade ?? '', m.objetivo_id ?? '', m.taxa ?? '', m.vencimento ?? ''].join(':'))
    .sort()
    .join('|')
  // djb2 — só para detectar mudança, não é segurança.
  let h = 5381
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0
  return `${movs.length}-${(h >>> 0).toString(36)}`
}

export interface LiquidoVigente {
  /** Valor exibido: o manual, se houver; senão o calculado. */
  valor: number
  calculado: number
  manual: boolean
  /** Data em que o valor manual foi informado. */
  manualEm: string | null
  /** Houve lançamentos novos/alterados depois do valor manual. */
  desatualizado: boolean
}

export function liquidoVigente(
  ativo: Pick<Ativo, 'liquido_manual' | 'liquido_manual_em' | 'liquido_manual_assinatura'>,
  calculado: number,
  movs: Movimentacao[],
): LiquidoVigente {
  if (ativo.liquido_manual == null) {
    return { valor: calculado, calculado, manual: false, manualEm: null, desatualizado: false }
  }
  return {
    valor: Number(ativo.liquido_manual),
    calculado,
    manual: true,
    manualEm: ativo.liquido_manual_em,
    desatualizado: ativo.liquido_manual_assinatura !== assinaturaLancamentos(movs),
  }
}
