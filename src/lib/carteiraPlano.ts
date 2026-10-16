// Minha Carteira — regras do planejamento (funções puras, sem acesso ao banco).
// Ver docs/plano-minha-carteira.md.
import { LIVRE, type Posicao } from './calculos'
import type { Ativo, CategoriaCarteira, Cotacao, Movimentacao, TipoAtivo } from './tipos'
import { ehRendaVariavel } from './tipos'
import type { CategoriaSim, ItemSim } from './carteiraSimulador'

/** Tolerância para considerar uma soma de percentuais "fechada" (0,01 p.p.). */
export const TOLERANCIA_PCT = 0.01

/** Distribuição inicial (Alternativa B). */
export const CATEGORIAS_PADRAO: { nome: string; percentual: number; cor: string }[] = [
  { nome: 'CDB pós-fixado', percentual: 20, cor: '#0F6E52' },
  { nome: 'LCI/LCA', percentual: 20, cor: '#0E8A8A' },
  { nome: 'Tesouro IPCA+', percentual: 20, cor: '#8A6D1F' },
  { nome: 'Fundos imobiliários (FIIs)', percentual: 20, cor: '#2F5BD3' },
  { nome: 'Ações brasileiras', percentual: 10, cor: '#7C4DBD' },
  { nome: 'ETF internacional', percentual: 10, cor: '#C2416B' },
]

/** Ativo com o que a Minha Carteira precisa para o planejamento. */
export interface AtivoPlano {
  ativo: Ativo
  /** Só a parte Livre conta na Minha Carteira. */
  valorLivre: number
  investidoLivre: number
  /** Cotas da parte Livre (renda variável). */
  quantidadeLivre: number
  /** Cotação mais recente, senão preço de referência, senão null. */
  preco: number | null
  /** De onde veio o preço (custo = custo médio, quando não há cotação nem referência). */
  fontePreco: 'cotacao' | 'referencia' | 'custo' | null
  dataPreco: string | null
  /** Data do primeiro aporte (aquisição). */
  dataAquisicao: string | null
  /** % alvo do ativo dentro da categoria (null = pendente). */
  pendente: boolean
}

export interface CategoriaPlano {
  categoria: CategoriaCarteira
  ativos: AtivoPlano[]
  /** Soma dos % alvo dos ativos da categoria (pendentes não contam). */
  somaAtivos: number
  /** % da categoria − soma dos ativos (positivo = falta distribuir). */
  faltaDistribuir: number
  pendentes: number
  /** % que cada pendente recebe automaticamente (o que falta na categoria ÷ pendentes). */
  automaticoPorPendente: number
  /** O plano da categoria fecha, contando o automático dos pendentes? */
  fechada: boolean
  /** Valor atual (parte Livre) dos investimentos da categoria. */
  valorAtual: number
  /** Fração 0–1 da carteira que está hoje nesta categoria. */
  atual: number
}

export interface Planejamento {
  categorias: CategoriaPlano[]
  /** Valor atual da carteira (parte Livre dos investimentos com categoria). */
  valorCarteira: number
  /** Soma dos % das categorias (deve ser 100). */
  somaCategorias: number
  categoriasOk: boolean
  /** Ativos com parte Livre que ainda não estão em nenhuma categoria. */
  foraDaCarteira: AtivoPlano[]
}

export function montarAtivoPlano(
  ativo: Ativo,
  posicao: Posicao,
  movs: Movimentacao[],
  cotacao: Cotacao | null,
): AtivoPlano {
  const livre = posicao.porDestino[LIVRE]
  const rv = ehRendaVariavel(ativo.tipo)
  const custo = rv && posicao.custoMedio > 0 ? posicao.custoMedio : null
  const preco = cotacao?.fechamento ?? ativo.preco_referencia ?? custo
  const aportes = movs.filter((m) => m.tipo === 'aporte').map((m) => m.data).sort()
  return {
    ativo,
    valorLivre: livre?.valorAtual ?? 0,
    investidoLivre: livre?.investido ?? 0,
    quantidadeLivre: ehRendaVariavel(ativo.tipo) ? (livre?.quantidade ?? 0) : 0,
    preco,
    fontePreco: cotacao ? 'cotacao' : ativo.preco_referencia != null ? 'referencia' : custo != null ? 'custo' : null,
    dataPreco: cotacao?.data ?? null,
    dataAquisicao: aportes[0] ?? null,
    pendente: ativo.percentual_alvo == null,
  }
}

const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

export function montarPlanejamento(categorias: CategoriaCarteira[], ativos: AtivoPlano[]): Planejamento {
  const ordenadas = [...categorias].sort((a, b) => a.ordem - b.ordem || a.criado_em.localeCompare(b.criado_em))
  const valorCarteira = soma(ativos.filter((a) => a.ativo.categoria_id != null).map((a) => a.valorLivre))
  const porCategoria = ordenadas.map((categoria): CategoriaPlano => {
    const daCategoria = ativos.filter((a) => a.ativo.categoria_id === categoria.id)
    const somaAtivos = soma(daCategoria.map((a) => a.ativo.percentual_alvo ?? 0))
    const faltaDistribuir = categoria.percentual - somaAtivos
    const pendentes = daCategoria.filter((a) => a.pendente).length
    const valorAtual = soma(daCategoria.map((a) => a.valorLivre))
    return {
      categoria,
      ativos: daCategoria,
      somaAtivos,
      faltaDistribuir,
      pendentes,
      automaticoPorPendente: pendentes ? Math.max(0, faltaDistribuir) / pendentes : 0,
      // Fecha se os % somam o da categoria, ou se o que falta vai para pendentes.
      fechada: daCategoria.length > 0 && (Math.abs(faltaDistribuir) < TOLERANCIA_PCT || (pendentes > 0 && faltaDistribuir > 0)),
      valorAtual,
      atual: valorCarteira > 0 ? valorAtual / valorCarteira : 0,
    }
  })
  const somaCategorias = soma(ordenadas.map((c) => c.percentual))
  return {
    categorias: porCategoria,
    valorCarteira,
    somaCategorias,
    categoriasOk: Math.abs(somaCategorias - 100) < TOLERANCIA_PCT,
    foraDaCarteira: ativos.filter((a) => a.ativo.categoria_id == null && a.valorLivre > 0.005),
  }
}

/**
 * Divide o % da categoria igualmente entre os ativos dela (atalho do planejamento).
 * Arredonda em 0,001 p.p. e coloca o resto no último para a soma fechar exato.
 */
export function dividirIgualmente(percentualCategoria: number, quantidade: number): number[] {
  if (quantidade <= 0) return []
  const base = Math.floor((percentualCategoria / quantidade) * 1000) / 1000
  const partes = Array.from({ length: quantidade }, () => base)
  partes[quantidade - 1] = Math.round((percentualCategoria - base * (quantidade - 1)) * 1000) / 1000
  return partes
}

/** Tipo de ativo que o nome da categoria sugere (ex.: "Fundos imobiliários (FIIs)" → FII). */
export function tipoDaCategoria(nomeCategoria: string | undefined): TipoAtivo | null {
  const n = (nomeCategoria ?? '').toLowerCase()
  if (n.includes('fii') || n.includes('imobili')) return 'fii'
  if (n.includes('etf')) return 'etf'
  if (n.includes('aç') || n.includes('acao') || n.includes('acoes')) return 'acao'
  if (n.includes('lci') || n.includes('lca')) return 'lci_lca'
  if (n.includes('tesouro')) return 'tesouro'
  if (n.includes('cdb')) return 'cdb'
  return null
}

/** Categoria em que um ativo sem categoria provavelmente se encaixa (pelo tipo dele). */
export function categoriaSugerida(tipo: TipoAtivo, categorias: CategoriaCarteira[]): CategoriaCarteira | null {
  return categorias.find((c) => tipoDaCategoria(c.nome) === tipo) ?? null
}

/**
 * Converte o planejamento para o formato do simulador / prioridades.
 * Investimentos livres ainda sem categoria (ex.: ITUB4) entram na categoria do tipo
 * deles, marcados como `sugerido`, para o valor que você já tem contar no rebalanceamento.
 */
export function paraSimulador(p: Planejamento): { categorias: CategoriaSim[]; itens: ItemSim[] } {
  const comoItem = (a: AtivoPlano, categoriaId: string, sugerido: boolean): ItemSim => ({
    id: a.ativo.id,
    rotulo: a.ativo.ticker || a.ativo.nome,
    categoriaId,
    percentualAlvo: sugerido ? null : a.ativo.percentual_alvo,
    valorAtual: a.valorLivre,
    rendaVariavel: ehRendaVariavel(a.ativo.tipo),
    preco: ehRendaVariavel(a.ativo.tipo) ? a.preco : null,
    lote: a.ativo.lote || 1,
    aplicacaoMinima: a.ativo.aplicacao_minima,
    incrementoMinimo: a.ativo.incremento_minimo,
    sugerido,
  })
  const cats = p.categorias.map((c) => c.categoria)
  const sugeridos = p.foraDaCarteira.flatMap((a) => {
    const c = categoriaSugerida(a.ativo.tipo, cats)
    return c ? [comoItem(a, c.id, true)] : []
  })
  return {
    categorias: p.categorias.map((c) => ({ id: c.categoria.id, nome: c.categoria.nome, percentual: c.categoria.percentual })),
    itens: [...p.categorias.flatMap((c) => c.ativos.map((a) => comoItem(a, c.categoria.id, false))), ...sugeridos],
  }
}

/** % da carteira que o ativo tem no plano: o configurado, ou o automático se estiver pendente. */
export function percentualNoPlano(c: CategoriaPlano, a: AtivoPlano): number {
  return a.ativo.percentual_alvo ?? c.automaticoPorPendente
}
