import { describe, expect, it } from 'vitest'
import { acompanhar, dividendosDesdeUltimoAporte, mesesEntre } from './carteiraAcompanhamento'
import { montarAtivoPlano, montarPlanejamento } from './carteiraPlano'
import { calcularPosicao } from './calculos'
import { OBS_PROVENTOS_ANTERIORES, type Ativo, type CategoriaCarteira, type Movimentacao } from './tipos'

const base: Ativo = {
  id: 'a', ticker: null, nome: 'Ativo', tipo: 'fii', instituicao: null, indexador: 'nenhum', taxa: null, vencimento: null, ativo: true,
  finalidade: 'investimento', criado_em: '', categoria_id: null, percentual_alvo: null, preco_referencia: null, aplicacao_minima: null,
  incremento_minimo: null, liquidez: null, lote: 1, liquido_manual: null, liquido_manual_em: null, liquido_manual_assinatura: null,
  progressiva: null, carencia_dias: null,
}
let n = 0
const mov = (ativo_id: string, extra: Partial<Movimentacao>): Movimentacao => {
  n++
  return { id: String(n), ativo_id, data: '2026-08-10', tipo: 'aporte', quantidade: null, preco_unitario: null, valor_total: 0, observacao: null, objetivo_id: null, criado_em: String(n).padStart(4, '0'), ...extra }
}
const cat = (id: string, nome: string, percentual: number): CategoriaCarteira => ({ id, nome, percentual, ordem: 0, cor: '#000', criado_em: '' })

function montar(ativos: { a: Ativo; movs: Movimentacao[]; cotacao?: number }[], cats: CategoriaCarteira[]) {
  const itens = ativos.map(({ a, movs, cotacao }) => {
    const p = calcularPosicao(a, movs, cotacao ?? null, [])
    return { plano: montarAtivoPlano(a, p, movs, cotacao ? { ticker: a.ticker!, data: '2026-10-18', fechamento: cotacao } as never : null), movimentacoes: movs }
  })
  return acompanhar(montarPlanejamento(cats, itens.map((i) => i.plano)), itens, '2026-10-19')
}

describe('acompanhamento', () => {
  const fii: Ativo = { ...base, id: 'fii', ticker: 'XPML11', categoria_id: 'c-fii' }
  const acao: Ativo = { ...base, id: 'acao', ticker: 'ITUB4', tipo: 'acao' } // sem categoria → sugerida pelo tipo
  const cdb: Ativo = { ...base, id: 'cdb', nome: 'CDB', tipo: 'cdb', indexador: 'cdi', taxa: 100 }
  const cats = [cat('c-fii', 'Fundos imobiliários (FIIs)', 50), cat('c-acao', 'Ações brasileiras', 50)]
  const r = montar(
    [
      { a: fii, movs: [mov('fii', { quantidade: 5, preco_unitario: 100, valor_total: 500, data: '2026-08-10' }), mov('fii', { tipo: 'dividendo', valor_total: 4, data: '2026-09-15' })], cotacao: 110 },
      { a: acao, movs: [mov('acao', { quantidade: 10, preco_unitario: 40, valor_total: 400, data: '2026-10-01' })], cotacao: 42 },
      // Só em objetivo: fica fora.
      { a: cdb, movs: [mov('cdb', { valor_total: 1000, objetivo_id: 'obj', data: '2026-09-01' })] },
    ],
    cats,
  )

  it('soma só a parte Investido: aplicado, valor, rendimento e dividendos', () => {
    expect(r.aplicado).toBeCloseTo(900, 6)
    expect(r.valor).toBeCloseTo(550 + 420, 6)
    expect(r.rendimento).toBeCloseTo(70, 6)
    expect(r.dividendos).toBeCloseTo(4, 6)
    expect(r.retornoTotal).toBeCloseTo(74, 6)
    expect(r.ativos.map((a) => a.id)).toEqual(['fii', 'acao'])
  })

  it('distribui por categoria, usando a categoria sugerida para quem não tem', () => {
    expect(r.categorias.find((c) => c.id === 'c-acao')!.aplicado).toBeCloseTo(400, 6)
    expect(r.categorias.find((c) => c.id === 'c-fii')!.valor).toBeCloseTo(550, 6)
    expect(r.categorias.some((c) => c.id === null)).toBe(false)
  })

  it('evolução mensal pelos lançamentos, sem pular meses', () => {
    expect(r.meses.map((m) => m.mes)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(r.meses[1]).toMatchObject({ aportes: 0, dividendos: 4, aplicadoAcumulado: 500 })
    expect(r.meses[2].aplicadoAcumulado).toBeCloseTo(900, 6)
  })

  it('dividendos "antes do cadastro" não entram em nenhum mês, mas contam no total', () => {
    const r2 = montar([{ a: fii, movs: [mov('fii', { quantidade: 1, preco_unitario: 100, valor_total: 100 }), mov('fii', { tipo: 'dividendo', valor_total: 9, observacao: OBS_PROVENTOS_ANTERIORES })] }], cats)
    expect(r2.dividendos).toBeCloseTo(9, 6)
    expect(r2.dividendosAnteriores).toBeCloseTo(9, 6)
    expect(r2.meses.reduce((s, m) => s + m.dividendos, 0)).toBe(0)
  })
})

describe('apoio', () => {
  it('meses entre datas atravessa o ano', () => {
    expect(mesesEntre('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
  it('dividendos desde o último aporte', () => {
    const movs = [
      mov('x', { data: '2026-09-01', valor_total: 100 }),
      mov('x', { tipo: 'dividendo', data: '2026-09-10', valor_total: 2 }),
      mov('x', { data: '2026-10-01', valor_total: 100 }),
      mov('x', { tipo: 'dividendo', data: '2026-10-15', valor_total: 3 }),
      mov('x', { tipo: 'jcp', data: '2026-10-16', valor_total: 1 }),
    ]
    expect(dividendosDesdeUltimoAporte(movs)).toEqual({ valor: 4, desde: '2026-10-01' })
  })
})
