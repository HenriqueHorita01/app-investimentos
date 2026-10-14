import { describe, expect, it } from 'vitest'
import { calcularPosicao, resumir } from './calculos'
import type { Movimentacao, TipoMovimentacao } from './tipos'

let n = 0
function mov(tipo: TipoMovimentacao, valor_total: number, quantidade: number | null = null): Movimentacao {
  return {
    id: String(++n),
    ativo_id: 'a',
    data: '2026-10-01',
    tipo,
    quantidade,
    preco_unitario: quantidade ? valor_total / quantidade : null,
    valor_total,
    observacao: null,
    criado_em: '',
  }
}

describe('renda variável', () => {
  it('calcula quantidade, custo médio, valor atual, variação e retorno', () => {
    const movs = [mov('aporte', 1500, 10), mov('aporte', 1485, 10), mov('dividendo', 23.4)]
    const p = calcularPosicao({ tipo: 'fii' }, movs, 148)
    expect(p.quantidade).toBe(20)
    expect(p.custoMedio).toBeCloseTo(149.25)
    expect(p.valorAtual).toBeCloseTo(2960)
    expect(p.variacao).toBeCloseTo(-25)
    expect(p.proventos).toBeCloseTo(23.4)
    expect(p.retornoTotal).toBeCloseTo(-1.6)
  })

  it('resgate reduz quantidade mas não muda o custo médio', () => {
    const movs = [mov('aporte', 1000, 10), mov('aporte', 1200, 10), mov('resgate', 650, 5)]
    const p = calcularPosicao({ tipo: 'acao' }, movs, 120)
    expect(p.quantidade).toBe(15)
    expect(p.custoMedio).toBeCloseTo(110)
    expect(p.investido).toBeCloseTo(1650)
    expect(p.valorAtual).toBeCloseTo(1800)
    expect(p.variacao).toBeCloseTo(150)
  })

  it('sem cotação usa o custo e marca semCotacao', () => {
    const p = calcularPosicao({ tipo: 'fii' }, [mov('aporte', 1000, 10)], null)
    expect(p.semCotacao).toBe(true)
    expect(p.valorAtual).toBe(1000)
    expect(p.variacao).toBe(0)
  })

  it('sem lançamentos fica zerado', () => {
    const p = calcularPosicao({ tipo: 'fii' }, [], 10)
    expect(p.quantidade).toBe(0)
    expect(p.valorAtual).toBe(0)
    expect(p.variacaoPercentual).toBe(0)
  })
})

describe('renda fixa (MVP)', () => {
  it('saldo = aplicado − resgatado', () => {
    const p = calcularPosicao({ tipo: 'cdb' }, [mov('aporte', 10000), mov('resgate', 2500)], null)
    expect(p.valorAtual).toBe(7500)
    expect(p.investido).toBe(7500)
    expect(p.variacao).toBe(0)
  })
})

describe('resumo', () => {
  it('soma patrimônio, investido e variação', () => {
    const a = calcularPosicao({ tipo: 'fii' }, [mov('aporte', 1000, 10)], 110)
    const b = calcularPosicao({ tipo: 'cdb' }, [mov('aporte', 5000)], null)
    const r = resumir([a, b])
    expect(r.patrimonio).toBeCloseTo(6100)
    expect(r.investido).toBeCloseTo(6000)
    expect(r.variacao).toBeCloseTo(100)
    expect(r.variacaoPercentual).toBeCloseTo(100 / 6000)
  })
})
