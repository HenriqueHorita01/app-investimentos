import { describe, expect, it } from 'vitest'
import { ajusteAplicacaoAntiga, ajustesParaSaldo, aliquotaIR, calcularPosicao, diasUteisEntre, LIVRE, progressoObjetivos, rendimentoNoMes, resumir, tributacaoDoLote, type SerieIpca } from './calculos'
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

  it('sem indexador o saldo é o aplicado', () => {
    const movs = [mov('aporte', 10000), mov('resgate', 2500)]
    const p = calcularPosicao({ ...CDB100, indexador: 'nenhum' }, movs, null, cdi)
    expect(p.valorAtual).toBe(7500)
    expect(p.investido).toBe(7500)
    expect(p.semRendimento).toBe(true)
  })
})

describe('resumo', () => {
  it('patrimônio livre = rendimento da renda fixa + dividendos (exemplo do SPEC)', () => {
    // Investiu 10.000 em CDB e 500 em ações; o CDB rendeu 100 e as ações pagaram 5 de dividendos.
    const cdb = calcularPosicao({ ...CDB100, indexador: 'pre' }, [mov('aporte', 10000), mov('ajuste', 100)], null)
    const acao = calcularPosicao({ ...FII, tipo: 'acao' }, [mov('aporte', 500, 10), mov('dividendo', 5)], 50)
    const r = resumir(
      [
        { tipo: 'cdb', posicao: cdb },
        { tipo: 'acao', posicao: acao },
      ],
      null,
    )
    expect(r.patrimonio).toBeCloseTo(105)
    expect(r.rendimentoRendaFixa).toBeCloseTo(100)
    expect(r.proventos).toBeCloseTo(5)
    expect(r.investido).toBeCloseTo(10500)
  })

  it('um investimento dividido entre objetivos, reserva e livre', () => {
    // 1.000 num CDB: 200 para um objetivo, 300 para outro, 500 para a reserva de emergência.
    const cdb = calcularPosicao(
      { ...CDB100, indexador: 'pre' },
      [
        mov('aporte', 200, null, { objetivo_id: 'viagem' }),
        mov('aporte', 300, null, { objetivo_id: 'presente' }),
        mov('aporte', 500, null, { objetivo_id: 'reserva' }),
        mov('ajuste', 10, null, { objetivo_id: 'reserva' }),
      ],
      null,
    )
    const r = resumir([{ tipo: 'cdb', posicao: cdb }], 'reserva')
    expect(r.reservado).toBeCloseTo(500)
    expect(r.reservaEmergencia).toBeCloseTo(510)
    expect(r.reservaInvestido).toBeCloseTo(500)
    // O rendimento da parte da reserva não entra no patrimônio livre.
    expect(r.patrimonio).toBeCloseTo(0)
    expect(r.investido).toBeCloseTo(0)
  })

  it('valorização das cotas fica fora do patrimônio livre', () => {
    const fii = calcularPosicao(FII, [mov('aporte', 1000, 10), mov('aporte', 500, 5, { objetivo_id: 'viagem' }), mov('dividendo', 12)], 110)
    const r = resumir([{ tipo: 'fii', posicao: fii }], null)
    expect(r.patrimonio).toBeCloseTo(12)
    expect(r.valorizacao).toBeCloseTo(100)
    expect(r.valorInvestido).toBeCloseTo(1100)
    expect(r.reservado).toBeCloseTo(550)
  })
})

describe('objetivos', () => {
  it('progresso = valor atual das partes reservadas ÷ valor-alvo', () => {
    const viagem: Objetivo = { id: 'viagem', nome: 'Viagem', valor_alvo: 2000, tipo: 'objetivo', prazo: null, cor: null, concluido: false, criado_em: '' }
    const p = calcularPosicao(FII, [mov('aporte', 1000, 10, { objetivo_id: 'viagem' })], 110)
    const [pr] = progressoObjetivos([viagem], [{ id: 'a', rotulo: 'HGLG11', posicao: p }])
    expect(pr.valorAtual).toBeCloseTo(1100)
    expect(pr.investido).toBeCloseTo(1000)
    expect(pr.progresso).toBeCloseTo(0.55)
    expect(pr.ativos).toEqual([{ ativoId: 'a', rotulo: 'HGLG11', valorAtual: 1100, investido: 1000 }])
  })
})

describe('ajuste de saldo (renda fixa)', () => {
  const CDB115: Pick<Ativo, 'tipo' | 'indexador' | 'taxa' | 'vencimento'> = { tipo: 'cdb', indexador: 'cdi', taxa: 115, vencimento: null }
  const cdi: CdiDia[] = [
    { data: '2026-10-13', taxa_dia: 0.05 },
    { data: '2026-10-14', taxa_dia: 0.05 },
  ]

  it('aplicação antiga: aporte + rendimento anterior, e o CDI rende por cima do saldo', () => {
    const movs = [
      mov('aporte', 5000, null, { data: '2026-10-13' }),
      mov('ajuste', 123.2, null, { data: '2026-10-13' }),
    ]
    const p = calcularPosicao(CDB115, movs, null, cdi)
    const fator = 1 + 0.0005 * 1.15
    expect(p.investido).toBe(5000)
    expect(p.valorAtual).toBeCloseTo(5123.2 * fator * fator)
    expect(p.variacao).toBeCloseTo(5123.2 * fator * fator - 5000)
  })

  it('corrige pelo extrato dividindo a diferença entre os destinos', () => {
    const movs = [
      mov('aporte', 3000, null, { data: '2026-10-13' }),
      mov('aporte', 1000, null, { data: '2026-10-13', objetivo_id: 'viagem' }),
    ]
    const { calculado, ajustes } = ajustesParaSaldo(CDB115, movs, cdi, '2026-10-14', 4100)
    expect(calculado).toBeCloseTo(4000 * (1 + 0.0005 * 1.15))
    const total = ajustes.reduce((s, a) => s + a.valor, 0)
    expect(total).toBeCloseTo(4100 - calculado, 2)
    expect(ajustes.find((a) => a.objetivo_id === 'viagem')!.valor).toBeCloseTo((4100 - calculado) / 4, 1)
    const corrigido = calcularPosicao(CDB115, [...movs, ...ajustes.map((a) => mov('ajuste', a.valor, null, { data: '2026-10-14', objetivo_id: a.objetivo_id }))], null, cdi.filter((d) => d.data < '2026-10-14'))
    expect(corrigido.valorAtual).toBeCloseTo(4100, 2)
  })

  it('não gera ajuste quando o extrato bate com o cálculo', () => {
    const movs = [mov('aporte', 1000, null, { data: '2026-10-13' })]
    const { ajustes } = ajustesParaSaldo(CDB115, movs, cdi, '2026-10-13', 1000)
    expect(ajustes).toEqual([])
  })
})

describe('rendimento no mês', () => {
  const CDB: Pick<Ativo, 'tipo' | 'indexador' | 'taxa' | 'vencimento'> = { tipo: 'cdb', indexador: 'cdi', taxa: 100, vencimento: null }

  it('conta dias úteis sem fins de semana e feriados fixos', () => {
    // 13/10/2026 (ter) → 31/10/2026 (sáb): 13 dias úteis
    expect(diasUteisEntre('2026-10-13', '2026-10-31')).toBe(13)
    // 09/10 (sex) → 13/10: 12/10 é feriado, sobra só 13/10
    expect(diasUteisEntre('2026-10-09', '2026-10-13')).toBe(1)
  })

  it('separa o realizado no mês da projeção até o fim do mês', () => {
    const cdi: CdiDia[] = [
      { data: '2026-09-30', taxa_dia: 1 },
      { data: '2026-10-01', taxa_dia: 1 },
      { data: '2026-10-02', taxa_dia: 1 },
    ]
    const movs = [mov('aporte', 1000, null, { data: '2026-09-30' })]
    const r = rendimentoNoMes(CDB, movs, cdi, '2026-10-05')
    // Setembro: 1000 → 1010. Outubro até agora: 1010 → 1030,301
    expect(r.realizado).toBeCloseTo(1030.301 - 1010)
    // Dias úteis de 03/10 (sáb) a 31/10: 19 (12/10 é feriado)
    expect(r.projetado).toBeCloseTo(1030.301 * (1.01 ** 19 - 1))
    expect(r.total).toBeCloseTo(r.realizado + r.projetado)
    expect(r.ritmoMensal).toBeCloseTo(1030.301 * (1.01 ** 21 - 1))
  })

  it('aporte no mês não conta como rendimento', () => {
    const cdi: CdiDia[] = [{ data: '2026-10-01', taxa_dia: 1 }]
    const movs = [mov('aporte', 1000, null, { data: '2026-10-01' }), mov('ajuste', 50, null, { data: '2026-10-01' })]
    const r = rendimentoNoMes(CDB, movs, cdi, '2026-10-01')
    expect(r.realizado).toBeCloseTo(10.5)
  })
})

describe('rendimento no mês com aplicação recente', () => {
  it('projeta pelo CDI mais recente mesmo sem CDI depois da aplicação', () => {
    const CDB: Pick<Ativo, 'tipo' | 'indexador' | 'taxa' | 'vencimento'> = { tipo: 'cdb', indexador: 'cdi', taxa: 100, vencimento: null }
    const movs = [mov('aporte', 1000, null, { data: '2026-10-13' })]
    const r = rendimentoNoMes(CDB, movs, [], '2026-10-13', { data: '2026-10-09', taxa_dia: 1 })
    expect(r.realizado).toBe(0)
    // Dias úteis de 10/10 a 31/10: 14 (12/10 é feriado)
    expect(r.projetado).toBeCloseTo(1000 * (1.01 ** 14 - 1))
  })
})

describe('aplicação antiga com a data original', () => {
  const CDB: Pick<Ativo, 'tipo' | 'indexador' | 'taxa' | 'vencimento'> = { tipo: 'cdb', indexador: 'cdi', taxa: 100, vencimento: null }
  const cdi: CdiDia[] = [
    { data: '2026-03-31', taxa_dia: 1 },
    { data: '2026-04-01', taxa_dia: 1 },
    { data: '2026-10-15', taxa_dia: 1 },
  ]

  it('o saldo de hoje fica igual ao informado (sem contar o CDI duas vezes)', () => {
    const aj = ajusteAplicacaoAntiga(CDB, '2026-03-31', 1999, 2144.92, cdi, '2026-10-15')
    expect(aj.data).toBe('2026-10-15')
    // Calculado até ontem: 1999 × 1,01 × 1,01 = 2039,1799
    expect(aj.valor).toBeCloseTo(2144.92 - 1999 * 1.01 * 1.01, 2)
    const movs = [
      mov('aporte', 1999, null, { data: '2026-03-31' }),
      mov('ajuste', aj.valor, null, { data: aj.data }),
    ]
    const ateOntem = calcularPosicao(CDB, movs, null, cdi.filter((d) => d.data < '2026-10-15'))
    expect(ateOntem.valorAtual).toBeCloseTo(2144.92, 2)
    expect(ateOntem.investido).toBe(1999)
  })
})

describe('aplicações individuais de renda fixa (lotes)', () => {
  const cal: CdiDia[] = [
    { data: '2026-01-05', taxa_dia: 0.05 },
    { data: '2026-02-02', taxa_dia: 0.05 },
    { data: '2026-03-02', taxa_dia: 0.05 },
    { data: '2026-03-03', taxa_dia: 0.05 },
  ]
  const TESOURO: Pick<Ativo, 'tipo' | 'indexador' | 'taxa' | 'vencimento'> = { tipo: 'tesouro', indexador: 'ipca', taxa: 6, vencimento: '2035-05-15' }
  const ipca: SerieIpca = new Map([
    ['2026-01', 0.4],
    ['2026-02', 0.3],
  ])

  it('Tesouro IPCA+ comprado 3 vezes: cada compra com a própria taxa e o total consolidado', () => {
    const movs = [
      mov('aporte', 200, null, { data: '2026-01-05', taxa: 6.0 }),
      mov('aporte', 300, null, { data: '2026-02-02', taxa: 6.3 }),
      mov('aporte', 500, null, { data: '2026-03-02', taxa: 5.8 }),
    ]
    const p = calcularPosicao(TESOURO, movs, null, cal, ipca)
    expect(p.lotes).toHaveLength(3)
    expect(p.lotes.map((l) => l.taxa)).toEqual([6.0, 6.3, 5.8])
    expect(p.investido).toBe(1000)
    // Soma dos lotes = total do título.
    expect(p.valorAtual).toBeCloseTo(p.lotes.reduce((s, l) => s + l.saldo, 0), 6)
    // IPCA do mês pró-rata pelos dias úteis + juro real da compra (6% a.a.).
    const f = (ipcaMes: number, de: string, ate: string) => (1 + ipcaMes / 100) ** (1 / diasUteisEntre(de, ate)) * 1.06 ** (1 / 252)
    const jan = f(0.4, '2025-12-31', '2026-01-31')
    const fev = f(0.3, '2026-01-31', '2026-02-28')
    const mar = f(0.3, '2026-02-28', '2026-03-31') // março projetado com o IPCA de fevereiro
    expect(p.lotes[0].saldo).toBeCloseTo(200 * jan * fev * mar * mar, 8)
    // Março ainda sem IPCA divulgado: usa o último conhecido e marca como estimativa.
    expect(p.lotes[2].ipcaEstimado).toBe(true)
    expect(p.lotes[0].ipcaEstimado).toBe(true)
  })

  it('prefixado rende (1 + taxa)^(1/252) por dia útil', () => {
    const p = calcularPosicao({ tipo: 'cdb', indexador: 'pre', taxa: 12, vencimento: null }, [mov('aporte', 1000, null, { data: '2026-03-02' })], null, cal)
    expect(p.valorAtual).toBeCloseTo(1000 * 1.12 ** (2 / 252), 6)
  })

  it('cada aplicação de CDB pode ter vencimento próprio e para de render nele', () => {
    const movs = [
      mov('aporte', 1000, null, { data: '2026-01-05', vencimento: '2026-03-02' }),
      mov('aporte', 1000, null, { data: '2026-01-05' }),
    ]
    const p = calcularPosicao({ tipo: 'cdb', indexador: 'cdi', taxa: 100, vencimento: null }, movs, null, cal)
    expect(p.lotes[0].saldo).toBeCloseTo(1000 * 1.0005 ** 2)
    expect(p.lotes[1].saldo).toBeCloseTo(1000 * 1.0005 ** 4)
  })

  it('resgate sai das aplicações mais antigas primeiro (PEPS)', () => {
    const movs = [
      mov('aporte', 1000, null, { data: '2026-01-05' }),
      mov('aporte', 1000, null, { data: '2026-02-02' }),
      mov('resgate', 1200, null, { data: '2026-03-03' }),
    ]
    const p = calcularPosicao({ tipo: 'cdb', indexador: 'nenhum', taxa: null, vencimento: null }, movs, null, cal)
    expect(p.lotes[0].saldo).toBe(0)
    expect(p.lotes[1].saldo).toBeCloseTo(800)
    expect(p.lotes[1].custo).toBeCloseTo(800)
  })
})

describe('tributação por aplicação', () => {
  it('IR regressivo pelo prazo de cada aplicação', () => {
    expect(aliquotaIR(100)).toBe(0.225)
    expect(aliquotaIR(181)).toBe(0.2)
    expect(aliquotaIR(400)).toBe(0.175)
    expect(aliquotaIR(721)).toBe(0.15)
    const t = tributacaoDoLote({ data: '2026-01-01', saldo: 1100, custo: 1000 }, '2026-04-11', false)
    expect(t.dias).toBe(100)
    expect(t.ir).toBeCloseTo(22.5)
    expect(t.liquido).toBeCloseTo(1077.5)
  })

  it('IOF nos primeiros 30 dias, antes do IR', () => {
    const t = tributacaoDoLote({ data: '2026-01-01', saldo: 1010, custo: 1000 }, '2026-01-11', false)
    expect(t.dias).toBe(10)
    expect(t.iof).toBeCloseTo(6.6) // 66% de 10
    expect(t.ir).toBeCloseTo((10 - 6.6) * 0.225)
  })

  it('LCI/LCA é isenta para pessoa física', () => {
    const t = tributacaoDoLote({ data: '2026-01-01', saldo: 1100, custo: 1000 }, '2026-02-01', true)
    expect(t.ir).toBe(0)
    expect(t.iof).toBe(0)
    expect(t.liquido).toBe(1100)
  })
})
