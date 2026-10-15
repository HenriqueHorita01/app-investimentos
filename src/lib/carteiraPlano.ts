// Minha Carteira — regras do planejamento (funções puras, sem acesso ao banco).
// Ver docs/plano-minha-carteira.md.
import { LIVRE, type Posicao } from './calculos'
import type { Ativo, CategoriaCarteira, Cotacao, Movimentacao } from './tipos'
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
}

export interface Planejamento {
  categorias: CategoriaPlano[]
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
  const porCategoria = ordenadas.map((categoria): CategoriaPlano => {
    const daCategoria = ativos.filter((a) => a.ativo.categoria_id === categoria.id)
    const somaAtivos = soma(daCategoria.map((a) => a.ativo.percentual_alvo ?? 0))
    return {
      categoria,
      ativos: daCategoria,
      somaAtivos,
      faltaDistribuir: categoria.percentual - somaAtivos,
      pendentes: daCategoria.filter((a) => a.pendente).length,
    }
  })
  const somaCategorias = soma(ordenadas.map((c) => c.percentual))
  return {
    categorias: porCategoria,
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

/** Converte o planejamento para o formato do simulador / prioridades. */
export function paraSimulador(p: Planejamento): { categorias: CategoriaSim[]; itens: ItemSim[] } {
  return {
    categorias: p.categorias.map((c) => ({ id: c.categoria.id, nome: c.categoria.nome, percentual: c.categoria.percentual })),
    itens: p.categorias.flatMap((c) =>
      c.ativos.map(
        (a): ItemSim => ({
          id: a.ativo.id,
          rotulo: a.ativo.ticker || a.ativo.nome,
          categoriaId: c.categoria.id,
          percentualAlvo: a.ativo.percentual_alvo,
          valorAtual: a.valorLivre,
          rendaVariavel: ehRendaVariavel(a.ativo.tipo),
          preco: ehRendaVariavel(a.ativo.tipo) ? a.preco : null,
          lote: a.ativo.lote || 1,
          aplicacaoMinima: a.ativo.aplicacao_minima,
          incrementoMinimo: a.ativo.incremento_minimo,
        }),
      ),
    ),
  }
}
