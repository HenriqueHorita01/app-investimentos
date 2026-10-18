import { describe, expect, it } from 'vitest'
import { calcularPosicao } from './calculos'
import { assinaturaLancamentos, calcularLiquido, liquidoVigente } from './liquido'
import type { Movimentacao, TipoMovimentacao } from './tipos'

let n = 0
function mov(tipo: TipoMovimentacao, valor_total: number, quantidade: number | null = null, extra: Partial<Movimentacao> = {}): Movimentacao {
  n++
  return { id: String(n), ativo_id: 'a', data: '2026-01-02', tipo, quantidade, preco_unitario: null, valor_total, observacao: null, objetivo_id: null, criado_em: String(n), ...extra }
}
const semIndexador = { indexador: 'nenhum' as const, taxa: null, vencimento: null }

describe('saldo líquido por investimento', () => {
  it('renda fixa: soma aplicação por aplicação, cada uma com o IR do seu prazo', () => {
    // Duas aplicações com ganho de R$ 100 cada (ajuste ligado a cada uma):
    // a de jan/2026 tem 290 dias em 19/10 (20%); a de ago/2026 tem 78 dias (22,5%).
    const movs = [
      mov('aporte', 1000, null, { data: '2026-01-02', criado_em: 'a' }),
      mov('ajuste', 100, null, { data: '2026-01-02', criado_em: 'a' }),
      mov('aporte', 1000, null, { data: '2026-08-02', criado_em: 'b' }),
      mov('ajuste', 100, null, { data: '2026-08-02', criado_em: 'b' }),
    ]
    const p = calcularPosicao({ tipo: 'cdb', ...semIndexador }, movs, null)
    const l = calcularLiquido({ tipo: 'cdb' }, p, '2026-10-19')
    expect(l.investido).toBe(2000)
    expect(l.rendimentoBruto).toBeCloseTo(200)
    expect(l.ir).toBeCloseTo(100 * 0.2 + 100 * 0.225)
    expect(l.bruto).toBeCloseTo(2200)
    expect(l.liquido).toBeCloseTo(2200 - 42.5)
  })

  it('LCI/LCA é isenta', () => {
    const p = calcularPosicao({ tipo: 'lci_lca', ...semIndexador }, [mov('aporte', 1000), mov('ajuste', 50)], null)
    expect(calcularLiquido({ tipo: 'lci_lca' }, p, '2026-10-19').liquido).toBeCloseTo(1050)
  })

  it('ações até R$ 20 mil isentas; acima, 15% do lucro', () => {
    const pequena = calcularPosicao({ tipo: 'acao', ...semIndexador }, [mov('aporte', 1000, 10)], 120)
    expect(calcularLiquido({ tipo: 'acao' }, pequena, '2026-10-19').ir).toBe(0)
    const grande = calcularPosicao({ tipo: 'acao', ...semIndexador }, [mov('aporte', 20000, 200)], 110)
    expect(calcularLiquido({ tipo: 'acao' }, grande, '2026-10-19').ir).toBeCloseTo(2000 * 0.15)
  })

  it('FII paga 20% sobre o lucro na venda; prejuízo não gera imposto', () => {
    const lucro = calcularPosicao({ tipo: 'fii', ...semIndexador }, [mov('aporte', 1000, 10)], 110)
    expect(calcularLiquido({ tipo: 'fii' }, lucro, '2026-10-19').ir).toBeCloseTo(20)
    const prejuizo = calcularPosicao({ tipo: 'fii', ...semIndexador }, [mov('aporte', 1000, 10)], 90)
    expect(calcularLiquido({ tipo: 'fii' }, prejuizo, '2026-10-19').ir).toBe(0)
  })
})

describe('valor líquido manual', () => {
  const movs = [mov('aporte', 1000)]
  const assinatura = assinaturaLancamentos(movs)

  it('sem valor manual usa o calculado', () => {
    const v = liquidoVigente({ liquido_manual: null, liquido_manual_em: null, liquido_manual_assinatura: null }, 1040, movs)
    expect(v).toMatchObject({ valor: 1040, manual: false, desatualizado: false })
  })

  it('com valor manual usa o informado e não é desatualizado se nada mudou', () => {
    const v = liquidoVigente({ liquido_manual: 1035.5, liquido_manual_em: '2026-10-19T10:00:00Z', liquido_manual_assinatura: assinatura }, 1040, movs)
    expect(v).toMatchObject({ valor: 1035.5, calculado: 1040, manual: true, desatualizado: false })
  })

  it('avisa quando houve novo lançamento depois do valor manual', () => {
    const v = liquidoVigente({ liquido_manual: 1035.5, liquido_manual_em: '2026-10-19T10:00:00Z', liquido_manual_assinatura: assinatura }, 1540, [
      ...movs,
      mov('aporte', 500),
    ])
    expect(v.desatualizado).toBe(true)
    expect(v.valor).toBe(1035.5) // não sobrescreve sozinho
  })
})
