import { describe, expect, it } from 'vitest'
import { calcularPosicao, LIVRE, progressoObjetivos, resumir } from './calculos'
import type { Ativo, CdiDia, Movimentacao, Objetivo, TipoMovimentacao } from './tipos'

let n = 0
function mov(
  tipo: TipoMovimentacao,
  valor_total: number,
  quantidade: number | null = null,
  extra: Partial<Movimentacao> = {},
): Movimentacao {
  n++
  return {
    id: String(n),
    ativo_id: 'a',
    data: '2026-10-01',
    tipo,
    quantidade,
    preco_unitario: quantidade ? valor_total / quantidade : null,
    valor_total,
    observacao: null,
    objetivo_id: null,
    criado_em: String(n).padStart(4, '0'),
    ...extra,
  }
}

const FII: Pick<Ativo, 'tipo' | 'indexador' | 'taxa' | 'vencimento'> = { tipo: 'fii', indexador: 'nenhum', taxa: null, vencimento: null }
const CDB100: Pick<Ativo, 'tipo' | 'indexador' | 'taxa' | 'vencimento'> = { tipo: 'cdb', indexador: 'cdi', taxa: 100, vencimento: null }

describe('renda variável', () => {
  it('calcula quantidade, custo médio, valor atual, variação e retorno', () => {
    const movs = [mov('aporte', 1500, 10), mov('aporte', 1485, 10), mov('dividendo', 23.4)]
    const p = calcularPosicao(FII, movs, 148)
    expect(p.quantidade).toBe(20)
    expect(p.custoMedio).toBeCloseTo(149.25)
    expect(p.valorAtual).toBeCloseTo(2960)
    expect(p.variacao).toBeCloseTo(-25)
    expect(p.proventos).toBeCloseTo(23.4)
    expect(p.retornoTotal).toBeCloseTo(-1.6)
  })

  it('resgate reduz quantidade mas não muda o custo médio', () => {
    const movs = [mov('aporte', 1000, 10), mov('aporte', 1200, 10), mov('resgate', 650, 5)]
    const p = calcularPosicao({ ...FII, tipo: 'acao' }, movs, 120)
    expect(p.quantidade).toBe(15)
    expect(p.custoMedio).toBeCloseTo(110)
    expect(p.investido).toBeCloseTo(1650)
    expect(p.valorAtual).toBeCloseTo(1800)
    expect(p.variacao).toBeCloseTo(150)
  })

  it('sem cotação usa o custo e marca semCotacao', () => {
    const p = calcularPosicao(FII, [mov('aporte', 1000, 10)], null)
    expect(p.semCotacao).toBe(true)
    expect(p.valorAtual).toBe(1000)
    expect(p.variacao).toBe(0)
  })

  it('separa cotas por destino e a valorização vai junto', () => {
    const movs = [mov('aporte', 1000, 10), mov('aporte', 500, 5, { objetivo_id: 'viagem' })]
    const p = calcularPosicao(FII, movs, 110)
    expect(p.porDestino[LIVRE].quantidade).toBe(10)
    expect(p.porDestino[LIVRE].valorAtual).toBeCloseTo(1100)
    expect(p.porDestino.viagem.quantidade).toBe(5)
    expect(p.porDestino.viagem.valorAtual).toBeCloseTo(550)
    expect(p.porDestino.viagem.investido).toBeCloseTo(500)
  })

  it('marca inconsistente quando um destino resgata mais do que tem', () => {
    const movs = [mov('aporte', 1000, 10), mov('resgate', 200, 2, { objetivo_id: 'viagem' })]
    expect(calcularPosicao(FII, movs, 100).inconsistente).toBe(true)
  })
})

describe('renda fixa pelo CDI', () => {
  const cdi: CdiDia[] = [
    { data: '2026-01-02', taxa_dia: 1 },
    { data: '2026-01-05', taxa_dia: 1 },
  ]

  it('saldo = aplicado × Π fatores desde a aplicação', () => {
    const p = calcularPosicao(CDB100, [mov('aporte', 1000, null, { data: '2026-01-02' })], null, cdi)
    expect(p.valorAtual).toBeCloseTo(1020.1)
    expect(p.investido).toBe(1000)
    expect(p.variacao).toBeCloseTo(20.1)
  })

  it('aplica o percentual contratado sobre o CDI', () => {
    const p = calcularPosicao({ ...CDB100, taxa: 50 }, [mov('aporte', 1000, null, { data: '2026-01-02' })], null, cdi)
    expect(p.valorAtual).toBeCloseTo(1000 * 1.005 * 1.005)
  })

  it('aporte depois de um dia não recebe o CDI daquele dia', () => {
    const p = calcularPosicao(CDB100, [mov('aporte', 1000, null, { data: '2026-01-03' })], null, cdi)
    expect(p.valorAtual).toBeCloseTo(1010)
  })

  it('resgate sai antes do fator do dia e reduz o custo na proporção', () => {
    const movs = [mov('aporte', 1000, null, { data: '2026-01-02' }), mov('resgate', 500, null, { data: '2026-01-05' })]
    const p = calcularPosicao(CDB100, movs, null, cdi)
    expect(p.valorAtual).toBeCloseTo(515.1)
    expect(p.investido).toBeCloseTo(1000 - 1000 * (500 / 1010))
  })

  it('para de render no vencimento', () => {
    const p = calcularPosicao({ ...CDB100, vencimento: '2026-01-05' }, [mov('aporte', 1000, null, { data: '2026-01-02' })], null, cdi)
    expect(p.valorAtual).toBeCloseTo(1010)
  })

  it('o rendimento da parte reservada fica no objetivo', () => {
    const movs = [
      mov('aporte', 1000, null, { data: '2026-01-02' }),
      mov('aporte', 1000, null, { data: '2026-01-02', objetivo_id: 'viagem' }),
    ]
    const p = calcularPosicao(CDB100, movs, null, cdi)
    expect(p.porDestino.viagem.valorAtual).toBeCloseTo(1020.1)
    expect(p.porDestino[LIVRE].valorAtual).toBeCloseTo(1020.1)
  })

  it('sem CDI (ou outro indexador) o saldo é o aplicado', () => {
    const movs = [mov('aporte', 10000), mov('resgate', 2500)]
    const p = calcularPosicao({ ...CDB100, indexador: 'pre' }, movs, null, cdi)
    expect(p.valorAtual).toBe(7500)
    expect(p.investido).toBe(7500)
    expect(p.semRendimento).toBe(true)
  })
})

describe('resumo', () => {
  it('patrimônio é só o livre; objetivos e reserva de emergência ficam de fora', () => {
    const carteira = calcularPosicao(FII, [mov('aporte', 1000, 10), mov('aporte', 500, 5, { objetivo_id: 'viagem' })], 110)
    const reserva = calcularPosicao(CDB100, [mov('aporte', 5000)], null)
    const r = resumir([
      { finalidade: 'investimento', posicao: carteira },
      { finalidade: 'reserva_emergencia', posicao: reserva },
    ])
    expect(r.patrimonio).toBeCloseTo(1100)
    expect(r.investido).toBeCloseTo(1000)
    expect(r.variacao).toBeCloseTo(100)
    expect(r.variacaoPercentual).toBeCloseTo(0.1)
    expect(r.reservado).toBeCloseTo(550)
    expect(r.reservaEmergencia).toBe(5000)
  })
})

describe('objetivos', () => {
  it('progresso = valor atual das partes reservadas ÷ valor-alvo', () => {
    const viagem: Objetivo = { id: 'viagem', nome: 'Viagem', valor_alvo: 2000, prazo: null, cor: null, concluido: false, criado_em: '' }
    const p = calcularPosicao(FII, [mov('aporte', 1000, 10, { objetivo_id: 'viagem' })], 110)
    const [pr] = progressoObjetivos([viagem], [{ id: 'a', rotulo: 'HGLG11', posicao: p }])
    expect(pr.valorAtual).toBeCloseTo(1100)
    expect(pr.investido).toBeCloseTo(1000)
    expect(pr.progresso).toBeCloseTo(0.55)
    expect(pr.ativos).toEqual([{ ativoId: 'a', rotulo: 'HGLG11', valorAtual: 1100, investido: 1000 }])
  })
})
