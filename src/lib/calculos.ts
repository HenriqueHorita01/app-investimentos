import type { Ativo, Movimentacao } from './tipos'
import { ehRendaVariavel } from './tipos'

/** Posição consolidada de um ativo — regras da seção 4 do SPEC. */
export interface Posicao {
  quantidade: number
  /** Custo total das compras ÷ quantidade comprada. Resgate não altera. */
  custoMedio: number
  /** Custo da posição atual (quantidade × custo médio; renda fixa: aplicado líquido). */
  investido: number
  /** null quando não há cotação (renda variável) ou para renda fixa. */
  cotacao: number | null
  /** Quantidade × última cotação. Sem cotação, usa o custo (semCotacao = true). */
  valorAtual: number
  /** Valor atual − (quantidade × custo médio). */
  variacao: number
  /** variação ÷ investido (fração). */
  variacaoPercentual: number
  /** Σ dividendos + JCP recebidos. */
  proventos: number
  /** variação + proventos recebidos. */
  retornoTotal: number
  semCotacao: boolean
}

const qtd = (m: Movimentacao) => Number(m.quantidade ?? 0)
const valor = (m: Movimentacao) => Number(m.valor_total ?? 0)

export function calcularPosicao(ativo: Pick<Ativo, 'tipo'>, movs: Movimentacao[], ultimaCotacao: number | null): Posicao {
  const proventos = movs.filter((m) => m.tipo === 'dividendo' || m.tipo === 'jcp').reduce((s, m) => s + valor(m), 0)

  if (ehRendaVariavel(ativo.tipo)) {
    let quantidade = 0
    let qtdComprada = 0
    let custoCompras = 0
    for (const m of movs) {
      if (m.tipo === 'aporte') {
        quantidade += qtd(m)
        qtdComprada += qtd(m)
        custoCompras += valor(m)
      } else if (m.tipo === 'resgate') {
        quantidade -= qtd(m)
      } else if (m.tipo === 'ajuste') {
        quantidade += qtd(m)
      }
    }
    quantidade = Math.round(quantidade * 1e6) / 1e6
    const custoMedio = qtdComprada > 0 ? custoCompras / qtdComprada : 0
    const investido = quantidade * custoMedio
    const semCotacao = ultimaCotacao == null
    const valorAtual = ultimaCotacao == null ? investido : quantidade * ultimaCotacao
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
      semCotacao,
    }
  }

  // Renda fixa no MVP: saldo = aplicado − resgatado. O rendimento pelo CDI entra na Fase 3.
  const aplicado = movs.reduce((s, m) => {
    if (m.tipo === 'aporte') return s + valor(m)
    if (m.tipo === 'resgate' || m.tipo === 'amortizacao') return s - valor(m)
    return s
  }, 0)
  return {
    quantidade: 0,
    custoMedio: 0,
    investido: aplicado,
    cotacao: null,
    valorAtual: aplicado,
    variacao: 0,
    variacaoPercentual: 0,
    proventos,
    retornoTotal: proventos,
    semCotacao: false,
  }
}

export interface Resumo {
  patrimonio: number
  investido: number
  variacao: number
  variacaoPercentual: number
  proventos: number
}

export function resumir(posicoes: Posicao[]): Resumo {
  const patrimonio = posicoes.reduce((s, p) => s + p.valorAtual, 0)
  const investido = posicoes.reduce((s, p) => s + p.investido, 0)
  const proventos = posicoes.reduce((s, p) => s + p.proventos, 0)
  const variacao = patrimonio - investido
  return { patrimonio, investido, variacao, variacaoPercentual: investido > 0 ? variacao / investido : 0, proventos }
}
