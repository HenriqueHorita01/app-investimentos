import { describe, expect, it } from 'vitest'
import { calcularPrioridades, compraPossivel, pesosEfetivos, recalcular, simularAporte, type CategoriaSim, type ItemSim } from './carteiraSimulador'

function rv(id: string, categoriaId: string, preco: number | null, percentualAlvo: number | null, valorAtual = 0, lote = 1): ItemSim {
  return { id, rotulo: id, categoriaId, percentualAlvo, valorAtual, rendaVariavel: true, preco, lote, aplicacaoMinima: null, incrementoMinimo: null }
}
function rf(id: string, categoriaId: string, percentualAlvo: number | null, valorAtual = 0, minimo: number | null = null, incremento: number | null = null): ItemSim {
  return { id, rotulo: id, categoriaId, percentualAlvo, valorAtual, rendaVariavel: false, preco: null, lote: 1, aplicacaoMinima: minimo, incrementoMinimo: incremento }
}
const cat = (id: string, percentual: number): CategoriaSim => ({ id, nome: id, percentual })

describe('pesos efetivos', () => {
  it('pendentes dividem o que falta na categoria', () => {
    const p = pesosEfetivos([cat('fii', 20), cat('cdb', 80)], [rv('a', 'fii', 100, 5), rv('b', 'fii', 100, null), rv('c', 'fii', 100, null), rf('d', 'cdb', 80)])
    expect(p.get('a')).toBeCloseTo(5)
    expect(p.get('b')).toBeCloseTo(7.5)
    expect(p.get('c')).toBeCloseTo(7.5)
  })
  it('normaliza quando as categorias não somam 100%', () => {
    const p = pesosEfetivos([cat('a', 30), cat('b', 30)], [rf('x', 'a', 30), rf('y', 'b', 30)])
    expect(p.get('x')).toBeCloseTo(50)
    expect(p.get('y')).toBeCloseTo(50)
  })
})

describe('compra possível', () => {
  it('renda variável compra unidades inteiras e respeita o lote', () => {
    expect(compraPossivel(rv('a', 'x', 9.5, 1), 100)).toEqual({ quantidade: 10, efetivo: 95, motivo: null })
    expect(compraPossivel(rv('a', 'x', 9.5, 1, 0, 100), 100).motivo).toBe('nao_cabe_unidade')
    expect(compraPossivel(rv('a', 'x', null, 1), 100).motivo).toBe('sem_preco')
  })
  it('renda fixa respeita mínimo e incremento', () => {
    expect(compraPossivel(rf('a', 'x', 1, 0, 500), 400).motivo).toBe('abaixo_do_minimo')
    expect(compraPossivel(rf('a', 'x', 1, 0, 500, 100), 780).efetivo).toBe(700)
    expect(compraPossivel(rf('a', 'x', 1, 0, null, null), 333.337).efetivo).toBe(333.33)
  })
})

describe('simulador — modo proporcional', () => {
  it('divide o aporte pelos percentuais', () => {
    const r = simularAporte([cat('fii', 50), cat('cdb', 50)], [rv('XPML11', 'fii', 100, 50), rf('CDB', 'cdb', 50)], 1000, 'proporcional')
    const xp = r.linhas.find((l) => l.item.id === 'XPML11')!
    expect(xp.ideal).toBe(500)
    expect(xp.quantidade).toBe(5)
    expect(r.totalEfetivo).toBe(1000)
    expect(r.sobra).toBe(0)
  })

  it('nunca passa do orçamento, usa a sobra em mais unidades e guarda o resto', () => {
    const r = simularAporte(
      [cat('fii', 20), cat('acao', 10), cat('cdb', 70)],
      [rv('FII', 'fii', 95, 20), rv('ACAO', 'acao', 30, 10), rf('CDB', 'cdb', 70, 0, 1000)],
      1000,
      'proporcional',
    )
    const cdb = r.linhas.find((l) => l.item.id === 'CDB')!
    expect(cdb.efetivo).toBe(0)
    expect(cdb.motivo).toBe('abaixo_do_minimo')
    expect(r.totalEfetivo).toBeLessThanOrEqual(1000)
    expect(r.totalEfetivo + r.sobra).toBeCloseTo(1000)
    // Com a sobra, compra mais uma ação e mais uma cota do FII.
    expect(r.linhas.find((l) => l.item.id === 'ACAO')!.quantidade).toBe(4)
    expect(r.linhas.find((l) => l.item.id === 'FII')!.quantidade).toBe(3)
    expect(r.sobra).toBeCloseTo(1000 - 285 - 120)
  })

  it('categoria sem investimento fica avisada e o dinheiro dela não é gasto à força', () => {
    const r = simularAporte([cat('fii', 50), cat('etf', 50)], [rv('FII', 'fii', 100, 50)], 1000, 'proporcional')
    expect(r.categoriasVazias).toEqual(['etf'])
    expect(r.linhas.find((l) => l.item.id === 'FII')!.ideal).toBeCloseTo(500)
  })
})

describe('simulador — rebalanceamento', () => {
  it('manda o dinheiro para quem está abaixo da meta, sem vender', () => {
    // Carteira: CDB 1.000, FII 0; metas 50/50; aporte 1.000 → tudo para o FII.
    const r = simularAporte([cat('fii', 50), cat('cdb', 50)], [rv('FII', 'fii', 100, 50, 0), rf('CDB', 'cdb', 50, 1000)], 1000, 'rebalanceamento')
    expect(r.linhas.find((l) => l.item.id === 'FII')!.ideal).toBeCloseTo(1000)
    expect(r.linhas.find((l) => l.item.id === 'CDB')!.ideal).toBeCloseTo(0)
    const fii = r.porCategoria.find((c) => c.id === 'fii')!
    expect(fii.antes).toBe(0)
    expect(fii.depois).toBeCloseTo(0.5)
  })

  it('compensa um mês em que comprou demais de uma categoria', () => {
    // Mês anterior comprou FII "a mais": FII 300, Ações 250, CDB 450 (metas 20/10/70).
    const itens = [rv('FII', 'fii', 10, 20, 300), rv('ACAO', 'acao', 10, 10, 250), rf('CDB', 'cdb', 70, 450)]
    const r = simularAporte([cat('fii', 20), cat('acao', 10), cat('cdb', 70)], itens, 1000, 'rebalanceamento')
    const valor = (id: string) => r.linhas.find((l) => l.item.id === id)!.ideal
    // Total 2.000: metas FII 400, Ações 200, CDB 1.400. Ações já passou → recebe 0.
    expect(valor('ACAO')).toBe(0)
    expect(valor('FII')).toBeCloseTo((1000 * 100) / 1050)
    expect(valor('CDB')).toBeCloseTo((1000 * 950) / 1050)
  })

  it('ajuste manual recalcula a sobra e a distribuição', () => {
    const categorias = [cat('fii', 50), cat('cdb', 50)]
    const itens = [rv('FII', 'fii', 100, 50), rf('CDB', 'cdb', 50)]
    const r = simularAporte(categorias, itens, 1000, 'proporcional')
    const linhas = r.linhas.map((l) => (l.item.id === 'FII' ? { ...l, quantidade: 3, efetivo: 300 } : l))
    const r2 = recalcular(r, categorias, itens, linhas)
    expect(r2.totalEfetivo).toBe(800)
    expect(r2.sobra).toBe(200)
  })
})

describe('prioridade de compra', () => {
  it('classifica o exemplo da especificação', () => {
    // Carteira de 1.000: FII 13%, Ações 16%, ETF 8%, CDB 20%, outros 43% (meta 40%).
    const ps = calcularPrioridades(
      [
        { id: 'fii', nome: 'FIIs', meta: 0.2, valor: 130 },
        { id: 'acao', nome: 'Ações', meta: 0.1, valor: 160 },
        { id: 'etf', nome: 'ETF', meta: 0.1, valor: 80 },
        { id: 'cdb', nome: 'CDB', meta: 0.2, valor: 200 },
        { id: 'outros', nome: 'Outros', meta: 0.4, valor: 430 },
      ],
      1000,
    )
    const nivel = (id: string) => ps.find((p) => p.id === id)!.nivel
    expect(nivel('fii')).toBe('alta')
    expect(nivel('acao')).toBe('acima')
    expect(nivel('etf')).toBe('media')
    expect(nivel('cdb')).toBe('equilibrado')
    expect(ps[0].id).toBe('fii')
    expect(ps[1].id).toBe('etf')
    expect(ps.find((p) => p.id === 'fii')!.necessidade).toBeCloseTo(70)
    expect(ps.find((p) => p.id === 'fii')!.desvioPP).toBeCloseTo(-7)
    // Acima da meta: necessidade zero, nunca sugere venda.
    expect(ps.find((p) => p.id === 'acao')!.necessidade).toBe(0)
  })

  it('considera o aporte na necessidade e se dá para comprar ao menos uma unidade', () => {
    const [p] = calcularPrioridades([{ id: 'fii', nome: 'FII', meta: 0.2, valor: 0, passoMinimo: 150 }], 0, 500)
    expect(p.necessidade).toBe(100)
    expect(p.compravel).toBe(true)
    const [q] = calcularPrioridades([{ id: 'fii', nome: 'FII', meta: 0.2, valor: 0, passoMinimo: 600 }], 0, 500)
    expect(q.compravel).toBe(false)
  })
})

describe('simulação por tipo (sem investimentos específicos)', () => {
  // Alternativa B e só o ITUB4 (R$ 500) em Ações; aporte de R$ 1.000.
  const categorias = [cat('cdb', 20), cat('lci', 20), cat('tesouro', 20), cat('fii', 20), cat('acoes', 10), cat('etf', 10)]
  const itens = [rv('ITUB4', 'acoes', 49.83, null, 500)]

  it('rebalanceamento: quanto vai para cada tipo, e Ações (acima da meta) recebe zero', () => {
    const r = simularAporte(categorias, itens, 1000, 'rebalanceamento')
    const ideal = (id: string) => r.porCategoria.find((c) => c.id === id)!.idealAporte
    for (const id of ['cdb', 'lci', 'tesouro', 'fii']) expect(ideal(id)).toBeCloseTo((1000 * 300) / 1350, 2)
    expect(ideal('etf')).toBeCloseTo((1000 * 150) / 1350, 2)
    expect(ideal('acoes')).toBe(0)
    // Tipos sem investimento escolhido ficam "a definir"; nada é gasto à força.
    expect(r.aDefinir).toBeCloseTo(1000, 1)
    expect(r.totalEfetivo).toBe(0)
    expect(r.sobra).toBeCloseTo(0, 1)
    expect(r.porCategoria.find((c) => c.id === 'acoes')!.depois).toBeCloseTo(500 / 1500, 3)
  })

  it('proporcional: 20/20/20/20/10/10 do aporte, e o ITUB4 recebe a parte de Ações', () => {
    const r = simularAporte(categorias, itens, 1000, 'proporcional')
    expect(r.porCategoria.find((c) => c.id === 'cdb')!.idealAporte).toBeCloseTo(200)
    expect(r.porCategoria.find((c) => c.id === 'etf')!.idealAporte).toBeCloseTo(100)
    const itub = r.linhas.find((l) => l.item.id === 'ITUB4')!
    expect(itub.ideal).toBeCloseTo(100)
    expect(itub.quantidade).toBe(2)
    expect(r.aDefinir).toBeCloseTo(900)
    expect(r.totalEfetivo + r.aDefinir + r.sobra).toBeCloseTo(1000)
  })
})
