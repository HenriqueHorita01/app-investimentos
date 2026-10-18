import { describe, expect, it } from 'vitest'
import { calcularPosicao, percentualVigente, projetarSaldo, tributacaoDoLote, type AtivoCalculo } from './calculos'
import { faixaEm, PRESET_NEON, proximaFaixa, somarMeses, type ConfigProgressiva } from './progressiva'
import type { CdiDia, Movimentacao, TipoMovimentacao } from './tipos'

let n = 0
function mov(tipo: TipoMovimentacao, valor_total: number, data: string, extra: Partial<Movimentacao> = {}): Movimentacao {
  n++
  return { id: `m${n}`, ativo_id: 'neon', data, tipo, quantidade: null, preco_unitario: null, valor_total, observacao: null, objetivo_id: null, criado_em: String(n).padStart(4, '0'), ...extra }
}

/** Dias úteis (seg–sex) entre duas datas com CDI constante de 0,05% ao dia. */
function calendario(de: string, ate: string, taxa = 0.05): CdiDia[] {
  const dias: CdiDia[] = []
  for (let d = new Date(de + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dias.push({ data: d.toISOString().slice(0, 10), taxa_dia: taxa })
  }
  return dias
}
const contar = (cal: CdiDia[], de: string, ate: string) => cal.filter((d) => d.data >= de && d.data <= ate).length

const NEON: AtivoCalculo = { tipo: 'cdb', indexador: 'cdi', taxa: 100, vencimento: null, progressiva: PRESET_NEON, carencia_dias: 30 }
const CURTA: ConfigProgressiva = {
  faixas: [
    { inicio: 0, unidade: 'dias', percentual: 100 },
    { inicio: 30, unidade: 'dias', percentual: 103 },
    { inicio: 60, unidade: 'dias', percentual: 113 },
  ],
  retroativa: true,
  contagem: 'individual',
}

describe('faixas', () => {
  it('somar meses respeita o fim do mês', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMeses('2026-10-19', 6)).toBe('2027-04-19')
  })
  it('faixa vigente e próxima faixa da Neon', () => {
    expect(faixaEm(PRESET_NEON, '2026-10-19', '2027-04-18')).toBe(0)
    expect(faixaEm(PRESET_NEON, '2026-10-19', '2027-04-19')).toBe(1)
    expect(faixaEm(PRESET_NEON, '2026-10-19', '2028-10-19')).toBe(4)
    expect(proximaFaixa(PRESET_NEON, '2026-10-19', '2026-11-01')).toEqual({ indice: 1, data: '2027-04-19', percentual: 103 })
  })
})

describe('rentabilidade progressiva retroativa', () => {
  const cal = calendario('2026-01-05', '2026-07-31')

  it('1) ao mudar de faixa recalcula o rendimento desde o início da aplicação', () => {
    const movs = [mov('aporte', 1000, '2026-01-05')]
    // Antes de 6 meses: 100% do CDI.
    const antes = calcularPosicao(NEON, movs, null, cal.filter((d) => d.data <= '2026-07-03'))
    expect(antes.lotes[0].saldo).toBeCloseTo(1000 * 1.0005 ** contar(cal, '2026-01-05', '2026-07-03'), 6)
    // Depois de 6 meses (05/07): TODO o período a 103% — não é 100% até jul + 103% depois.
    const depois = calcularPosicao(NEON, movs, null, cal)
    const n = contar(cal, '2026-01-05', '2026-07-31')
    expect(depois.lotes[0].saldo).toBeCloseTo(1000 * (1 + 0.0005 * 1.03) ** n, 6)
    expect(percentualVigente(depois.lotes[0])).toBe(103)
  })

  it('não retroativa: cada dia rende com a taxa da faixa daquele dia', () => {
    const prosp: AtivoCalculo = { ...NEON, progressiva: { ...PRESET_NEON, retroativa: false } }
    const p = calcularPosicao(prosp, [mov('aporte', 1000, '2026-01-05')], null, cal)
    const n100 = contar(cal, '2026-01-05', '2026-07-04')
    const n103 = contar(cal, '2026-07-05', '2026-07-31')
    expect(p.lotes[0].saldo).toBeCloseTo(1000 * 1.0005 ** n100 * (1 + 0.0005 * 1.03) ** n103, 6)
  })

  it('2) e 3) cada aporte conta o próprio prazo; um aporte recente não herda a faixa do primeiro', () => {
    const ativo: AtivoCalculo = { ...NEON, progressiva: CURTA }
    const curto = calendario('2026-01-05', '2026-03-31')
    const movs = [mov('aporte', 1000, '2026-01-05'), mov('aporte', 500, '2026-03-20')]
    const p = calcularPosicao(ativo, movs, null, curto)
    expect(percentualVigente(p.lotes[0])).toBe(113) // > 60 dias
    expect(percentualVigente(p.lotes[1])).toBe(100) // 11 dias, ainda na 1ª faixa
    expect(p.lotes[1].saldo).toBeCloseTo(500 * 1.0005 ** contar(curto, '2026-03-20', '2026-03-31'), 6)
  })

  it('contagem compartilhada: aportes posteriores usam o tempo desde o 1º aporte', () => {
    const ativo: AtivoCalculo = { ...NEON, progressiva: { ...CURTA, contagem: 'compartilhada' } }
    const curto = calendario('2026-01-05', '2026-03-31')
    const p = calcularPosicao(ativo, [mov('aporte', 1000, '2026-01-05'), mov('aporte', 500, '2026-03-20')], null, curto)
    expect(percentualVigente(p.lotes[1])).toBe(113)
  })

  it('4) IR só sobre o rendimento de cada aplicação', () => {
    const p = calcularPosicao(NEON, [mov('aporte', 1000, '2026-01-05')], null, cal)
    const l = p.lotes[0]
    const t = tributacaoDoLote(l, '2026-07-31', false)
    expect(t.ir).toBeCloseTo((l.saldo - 1000) * 0.2, 6) // 207 dias → 20%
    expect(t.liquido).toBeCloseTo(l.saldo - t.ir, 6)
  })

  it('5) resgate parcial não duplica rendimento e o resto continua com o prazo original', () => {
    const movs = [mov('aporte', 1000, '2026-01-05'), mov('resgate', 500, '2026-04-01')]
    const p = calcularPosicao(NEON, movs, null, cal)
    // Na data do resgate a cota valia o acumulado a 100% (até o dia anterior).
    const cotaNoResgate = 1.0005 ** contar(cal, '2026-01-05', '2026-03-31')
    const cotasRestantes = (1000 * cotaNoResgate - 500) / cotaNoResgate
    const n = contar(cal, '2026-01-05', '2026-07-31')
    expect(p.lotes[0].saldo).toBeCloseTo(cotasRestantes * (1 + 0.0005 * 1.03) ** n, 6)
    // Custo cai na proporção do saldo resgatado.
    expect(p.lotes[0].custo).toBeCloseTo(1000 * (1 - 500 / (1000 * cotaNoResgate)), 6)
  })

  it('resgate de uma aplicação escolhida não mexe nas outras', () => {
    const ativo: AtivoCalculo = { ...NEON, progressiva: CURTA }
    const curto = calendario('2026-01-05', '2026-03-31')
    const movs = [mov('aporte', 1000, '2026-01-05'), mov('aporte', 500, '2026-02-02')]
    const segunda = movs[1].id
    const p = calcularPosicao(ativo, [...movs, mov('resgate', 100, '2026-03-16', { aplicacao_id: segunda })], null, curto)
    const sem = calcularPosicao(ativo, movs, null, curto)
    expect(p.lotes[0].saldo).toBeCloseTo(sem.lotes[0].saldo, 9)
    expect(p.lotes[1].saldo).toBeLessThan(sem.lotes[1].saldo)
  })

  it('6) o consolidado é a soma das aplicações', () => {
    const p = calcularPosicao(NEON, [mov('aporte', 1000, '2026-01-05'), mov('aporte', 500, '2026-03-02'), mov('aporte', 200, '2026-05-04')], null, cal)
    expect(p.valorAtual).toBeCloseTo(p.lotes.reduce((s, l) => s + l.saldo, 0), 9)
    expect(p.investido).toBeCloseTo(1700, 9)
  })

  it('carência: disponível a partir do 31º dia de cada aplicação', () => {
    const p = calcularPosicao(NEON, [mov('aporte', 1000, '2026-10-19')], null, [])
    expect(p.lotes[0].disponivelEm).toBe('2026-11-18')
  })

  it('8) projeção é separada do realizado e usa a faixa futura', () => {
    const p = calcularPosicao(NEON, [mov('aporte', 1000, '2026-01-05')], null, cal.filter((d) => d.data <= '2026-06-30'))
    const l = p.lotes[0]
    const realizado = l.saldo
    const projetado = projetarSaldo(l, '2026-07-31', 0.05)
    expect(l.saldo).toBe(realizado) // projetar não altera o realizado
    expect(projetado).toBeGreaterThan(realizado)
    // Em 31/07 já estará na faixa de 103%: recalcula desde o início (retroativo).
    const nReal = contar(cal, '2026-01-05', '2026-06-30')
    const nFuturo = contar(calendario('2026-07-01', '2026-07-31'), '2026-07-01', '2026-07-31')
    expect(projetado).toBeCloseTo(1000 * (1 + 0.0005 * 1.03) ** (nReal + nFuturo), 4)
  })
})

describe('7) investimentos convencionais não mudam', () => {
  it('CDB comum a 100% do CDI segue igual', () => {
    const cal = calendario('2026-01-05', '2026-07-31')
    const p = calcularPosicao({ tipo: 'cdb', indexador: 'cdi', taxa: 100, vencimento: null }, [mov('aporte', 1000, '2026-01-05')], null, cal)
    expect(p.lotes[0].progressiva).toBeNull()
    expect(p.lotes[0].saldo).toBeCloseTo(1000 * 1.0005 ** cal.length, 6)
  })
})
