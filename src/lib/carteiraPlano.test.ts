import { describe, expect, it } from 'vitest'
import { CATEGORIAS_PADRAO, dividirIgualmente, montarAtivoPlano, montarPlanejamento, paraSimulador, percentualNoPlano } from './carteiraPlano'
import { calcularPosicao } from './calculos'
import type { Ativo, CategoriaCarteira, Movimentacao } from './tipos'

function ativo(extra: Partial<Ativo>): Ativo {
  return {
    id: 'a',
    ticker: null,
    nome: 'Ativo',
    tipo: 'fii',
    instituicao: null,
    indexador: 'nenhum',
    taxa: null,
    vencimento: null,
    ativo: true,
    finalidade: 'investimento',
    criado_em: '',
    categoria_id: null,
    percentual_alvo: null,
    preco_referencia: null,
    aplicacao_minima: null,
    incremento_minimo: null,
    liquidez: null,
    lote: 1,
    ...extra,
  }
}

function categoria(id: string, percentual: number, ordem = 0): CategoriaCarteira {
  return { id, nome: id, percentual, ordem, cor: null, criado_em: '' }
}

let n = 0
function mov(extra: Partial<Movimentacao>): Movimentacao {
  n++
  return {
    id: String(n),
    ativo_id: 'a',
    data: '2026-10-01',
    tipo: 'aporte',
    quantidade: null,
    preco_unitario: null,
    valor_total: 0,
    observacao: null,
    objetivo_id: null,
    criado_em: String(n),
    ...extra,
  }
}

describe('distribuição padrão', () => {
  it('Alternativa B soma 100%', () => {
    expect(CATEGORIAS_PADRAO.reduce((s, c) => s + c.percentual, 0)).toBe(100)
  })
})

describe('ativo no planejamento', () => {
  it('conta só a parte Livre e usa a cotação mais recente', () => {
    const a = ativo({ ticker: 'XPML11', preco_referencia: 100 })
    const movs = [
      mov({ data: '2026-09-01', quantidade: 10, valor_total: 1000 }),
      mov({ data: '2026-09-10', quantidade: 5, valor_total: 500, objetivo_id: 'viagem' }),
    ]
    const p = montarAtivoPlano(a, calcularPosicao(a, movs, 110), movs, { ticker: 'XPML11', data: '2026-10-14', fechamento: 110, fonte: 'manual' })
    expect(p.quantidadeLivre).toBe(10)
    expect(p.valorLivre).toBeCloseTo(1100)
    expect(p.investidoLivre).toBeCloseTo(1000)
    expect(p.preco).toBe(110)
    expect(p.fontePreco).toBe('cotacao')
    expect(p.dataAquisicao).toBe('2026-09-01')
    expect(p.pendente).toBe(true)
  })

  it('sem cotação usa o preço de referência; ativo futuro fica com valor zero', () => {
    const a = ativo({ ticker: 'HGLG11', preco_referencia: 158.5, percentual_alvo: 5 })
    const p = montarAtivoPlano(a, calcularPosicao(a, [], null), [], null)
    expect(p.preco).toBe(158.5)
    expect(p.fontePreco).toBe('referencia')
    expect(p.valorLivre).toBe(0)
    expect(p.pendente).toBe(false)
  })
})

describe('planejamento', () => {
  const plano = (a: Ativo, valor = 0) => ({
    ativo: a,
    valorLivre: valor,
    investidoLivre: valor,
    quantidadeLivre: 0,
    preco: null,
    fontePreco: null,
    dataPreco: null,
    dataAquisicao: null,
    pendente: a.percentual_alvo == null,
  })

  it('valida a soma das categorias e o que falta distribuir em cada uma', () => {
    const cats = [categoria('fii', 20, 1), categoria('acao', 10, 2), categoria('cdb', 70, 0)]
    const ativos = [
      plano(ativo({ id: '1', categoria_id: 'fii', percentual_alvo: 5 })),
      plano(ativo({ id: '2', categoria_id: 'fii', percentual_alvo: 5 })),
      plano(ativo({ id: '3', categoria_id: 'fii', percentual_alvo: null })),
      plano(ativo({ id: '4', categoria_id: null }), 498.3),
    ]
    const p = montarPlanejamento(cats, ativos)
    expect(p.somaCategorias).toBe(100)
    expect(p.categoriasOk).toBe(true)
    expect(p.categorias.map((c) => c.categoria.id)).toEqual(['cdb', 'fii', 'acao'])
    const fii = p.categorias[1]
    expect(fii.somaAtivos).toBe(10)
    expect(fii.faltaDistribuir).toBe(10)
    expect(fii.pendentes).toBe(1)
    expect(p.foraDaCarteira.map((a) => a.ativo.id)).toEqual(['4'])
  })

  it('acusa quando as categorias não somam 100%', () => {
    expect(montarPlanejamento([categoria('a', 60), categoria('b', 30)], []).categoriasOk).toBe(false)
  })

  it('divide o % da categoria igualmente, fechando a soma exata', () => {
    expect(dividirIgualmente(20, 4)).toEqual([5, 5, 5, 5])
    const tres = dividirIgualmente(10, 3)
    expect(tres).toEqual([3.333, 3.333, 3.334])
    expect(tres.reduce((s, x) => s + x, 0)).toBeCloseTo(10, 9)
  })
})

describe('ativos sem categoria no simulador', () => {
  it('ITUB4 sem categoria conta em "Ações brasileiras" pelo tipo', () => {
    const cats = [categoria('cdb', 20, 0), categoria('acoes', 10, 1)]
    cats[0].nome = 'CDB pós-fixado'
    cats[1].nome = 'Ações brasileiras'
    const itub = ativo({ id: 'itub', ticker: 'ITUB4', tipo: 'acao' })
    const p = montarPlanejamento(cats, [
      { ativo: itub, valorLivre: 498.3, investidoLivre: 424, quantidadeLivre: 10, preco: 49.83, fontePreco: 'cotacao', dataPreco: null, dataAquisicao: null, pendente: true },
    ])
    const { itens } = paraSimulador(p)
    expect(itens).toHaveLength(1)
    expect(itens[0]).toMatchObject({ id: 'itub', categoriaId: 'acoes', valorAtual: 498.3, sugerido: true })
  })
})

describe('categoria com investimento pendente', () => {
  it('o único investimento pendente recebe todo o % da categoria e a categoria fecha', () => {
    const cats = [categoria('acoes', 10, 0), categoria('cdb', 90, 1)]
    const itub = ativo({ id: 'itub', ticker: 'ITUB4', tipo: 'acao', categoria_id: 'acoes', percentual_alvo: null })
    const p = montarPlanejamento(cats, [
      { ativo: itub, valorLivre: 498.3, investidoLivre: 424.3, quantidadeLivre: 10, preco: 49.83, fontePreco: 'cotacao', dataPreco: null, dataAquisicao: null, pendente: true },
    ])
    const acoes = p.categorias.find((c) => c.categoria.id === 'acoes')!
    expect(acoes.automaticoPorPendente).toBe(10)
    expect(acoes.fechada).toBe(true)
    expect(percentualNoPlano(acoes, acoes.ativos[0])).toBe(10)
    // Hoje 100% da carteira está em Ações (é o único investimento).
    expect(p.valorCarteira).toBeCloseTo(498.3)
    expect(acoes.atual).toBeCloseTo(1)
    expect(p.categorias.find((c) => c.categoria.id === 'cdb')!.atual).toBe(0)
  })
})
