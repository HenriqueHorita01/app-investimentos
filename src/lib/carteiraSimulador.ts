// Minha Carteira — simulador de aportes e prioridade de compra (funções puras).
// Ver docs/plano-minha-carteira.md §3.

/** Um investimento como o simulador enxerga. */
export interface ItemSim {
  id: string
  rotulo: string
  categoriaId: string
  /** % alvo da carteira total (null = pendente; recebe o que sobrar da categoria). */
  percentualAlvo: number | null
  /** Valor atual (parte Livre). */
  valorAtual: number
  /** Renda variável compra em unidades; renda fixa por valor. */
  rendaVariavel: boolean
  /** Preço unitário (renda variável). null = sem preço, não dá para simular compra. */
  preco: number | null
  /** Quantidade mínima por compra (renda variável). */
  lote: number
  /** Renda fixa: valor mínimo da aplicação e incremento depois dele. */
  aplicacaoMinima: number | null
  incrementoMinimo: number | null
}

export interface CategoriaSim {
  id: string
  nome: string
  percentual: number
}

export type ModoSim = 'proporcional' | 'rebalanceamento'

export type MotivoSobra = 'sem_preco' | 'abaixo_do_minimo' | 'nao_cabe_unidade' | null

export interface LinhaSim {
  item: ItemSim
  /** % efetivo usado (pendentes recebem a sobra da categoria). */
  percentual: number
  /** Valor ideal do aporte para este ativo. */
  ideal: number
  /** Renda variável: unidades compradas. Renda fixa: 0. */
  quantidade: number
  /** Valor efetivo da compra. */
  efetivo: number
  /** ideal − efetivo (pode ser negativo se a sobra foi usada aqui). */
  diferenca: number
  motivo: MotivoSobra
}

export interface DistribuicaoCat {
  id: string
  nome: string
  meta: number
  /** Frações 0–1. */
  antes: number
  depois: number
  valorAntes: number
  valorDepois: number
  idealAporte: number
  efetivoAporte: number
}

export interface ResultadoSim {
  modo: ModoSim
  orcamento: number
  linhas: LinhaSim[]
  totalEfetivo: number
  /** Não investido: fica no saldo para os próximos aportes. */
  sobra: number
  porCategoria: DistribuicaoCat[]
  /** Categorias com % mas sem nenhum investimento para receber dinheiro. */
  categoriasVazias: string[]
  /** Soma dos % das categorias (o simulador normaliza se não for 100). */
  somaPercentuais: number
}

const c2 = (v: number) => Math.floor(v * 100 + 1e-6) / 100

/**
 * % efetivo de cada item: o configurado; pendentes dividem igualmente o que falta na
 * categoria. Se as categorias não somam 100, normaliza para somar 100.
 */
export function pesosEfetivos(categorias: CategoriaSim[], itens: ItemSim[]): Map<string, number> {
  const pesos = new Map<string, number>()
  const soma = categorias.reduce((s, c) => s + c.percentual, 0)
  const fator = soma > 0 ? 100 / soma : 0
  for (const c of categorias) {
    const daCat = itens.filter((i) => i.categoriaId === c.id)
    const configurados = daCat.filter((i) => i.percentualAlvo != null)
    const pendentes = daCat.filter((i) => i.percentualAlvo == null)
    const somaConf = configurados.reduce((s, i) => s + (i.percentualAlvo ?? 0), 0)
    const resto = Math.max(0, c.percentual - somaConf)
    if (!pendentes.length && somaConf > 0) {
      // Escala os configurados para ocuparem exatamente o % da categoria.
      for (const i of configurados) pesos.set(i.id, ((i.percentualAlvo ?? 0) / somaConf) * c.percentual * fator)
    } else {
      for (const i of configurados) pesos.set(i.id, (i.percentualAlvo ?? 0) * fator)
      for (const i of pendentes) pesos.set(i.id, (resto / pendentes.length) * fator)
    }
  }
  return pesos
}

/** Quanto do valor `v` dá para efetivamente aplicar no item (unidades inteiras / mínimos). */
export function compraPossivel(item: ItemSim, v: number): { quantidade: number; efetivo: number; motivo: MotivoSobra } {
  if (v <= 0.004) return { quantidade: 0, efetivo: 0, motivo: null }
  if (item.rendaVariavel) {
    if (item.preco == null || item.preco <= 0) return { quantidade: 0, efetivo: 0, motivo: 'sem_preco' }
    const passo = item.preco * item.lote
    const lotes = Math.floor(v / passo + 1e-9)
    if (lotes < 1) return { quantidade: 0, efetivo: 0, motivo: 'nao_cabe_unidade' }
    const quantidade = lotes * item.lote
    return { quantidade, efetivo: c2(quantidade * item.preco), motivo: null }
  }
  const minimo = item.aplicacaoMinima ?? 0
  if (v + 1e-9 < minimo) return { quantidade: 0, efetivo: 0, motivo: 'abaixo_do_minimo' }
  const inc = item.incrementoMinimo
  const efetivo = inc ? minimo + Math.floor((v - minimo) / inc + 1e-9) * inc : c2(v)
  return { quantidade: 0, efetivo: c2(efetivo), motivo: null }
}

/** Valor do próximo "passo" de compra (uma unidade/lote ou o mínimo/incremento). */
function proximoPasso(item: ItemSim, efetivoAtual: number): number | null {
  if (item.rendaVariavel) return item.preco && item.preco > 0 ? item.preco * item.lote : null
  if (efetivoAtual <= 0) return Math.max(item.aplicacaoMinima ?? 0, item.incrementoMinimo ?? 0.01)
  return item.incrementoMinimo ?? null
}

/**
 * Simula um aporte.
 * - Proporcional: cada ativo recebe orçamento × % (ignora desequilíbrios).
 * - Rebalanceamento: metas sobre (carteira + orçamento); o dinheiro vai primeiro para os
 *   maiores déficits; nunca sugere vender.
 * Depois converte em compras possíveis (inteiras/mínimos) e usa a sobra, por prioridade,
 * enquanto couber mais uma unidade. O que não couber fica como sobra (saldo a investir).
 */
export function simularAporte(categorias: CategoriaSim[], itens: ItemSim[], orcamento: number, modo: ModoSim): ResultadoSim {
  const pesos = pesosEfetivos(categorias, itens)
  const elegiveis = itens.filter((i) => (pesos.get(i.id) ?? 0) > 0)
  const carteira = itens.reduce((s, i) => s + i.valorAtual, 0)
  const total = carteira + orcamento

  // 1) Valor ideal por ativo.
  const ideal = new Map<string, number>()
  if (modo === 'proporcional') {
    for (const i of elegiveis) ideal.set(i.id, (orcamento * (pesos.get(i.id) ?? 0)) / 100)
  } else {
    const deficits = new Map(elegiveis.map((i) => [i.id, Math.max(0, (total * (pesos.get(i.id) ?? 0)) / 100 - i.valorAtual)]))
    const somaDef = [...deficits.values()].reduce((s, d) => s + d, 0)
    for (const i of elegiveis) {
      const d = deficits.get(i.id) ?? 0
      ideal.set(i.id, somaDef >= orcamento ? (somaDef > 0 ? (orcamento * d) / somaDef : 0) : d + ((orcamento - somaDef) * (pesos.get(i.id) ?? 0)) / 100)
    }
  }

  // 2) Compras possíveis com o ideal de cada um.
  const linhas: LinhaSim[] = elegiveis.map((item) => {
    const v = ideal.get(item.id) ?? 0
    const c = compraPossivel(item, v)
    return { item, percentual: pesos.get(item.id) ?? 0, ideal: v, quantidade: c.quantidade, efetivo: c.efetivo, diferenca: v - c.efetivo, motivo: c.motivo }
  })

  // 3) Usa a sobra: mais uma unidade para quem está mais longe do ideal/meta, se couber.
  let restante = c2(orcamento - linhas.reduce((s, l) => s + l.efetivo, 0))
  const meta = (l: LinhaSim) => (modo === 'proporcional' ? l.ideal : (total * l.percentual) / 100 - l.item.valorAtual)
  for (let guarda = 0; guarda < 10000 && restante > 0.004; guarda++) {
    const candidatos = linhas
      .map((l) => ({ l, passo: proximoPasso(l.item, l.efetivo), falta: meta(l) - l.efetivo }))
      .filter((x) => x.passo != null && x.passo <= restante + 1e-9 && x.falta > 0.004)
      .sort((a, b) => b.falta / Math.max(1, meta(b.l)) - a.falta / Math.max(1, meta(a.l)) || b.falta - a.falta)
    const escolhido = candidatos[0]
    if (!escolhido) break
    const { l, passo } = escolhido
    if (l.item.rendaVariavel) l.quantidade += l.item.lote
    l.efetivo = c2(l.efetivo + passo!)
    l.diferenca = l.ideal - l.efetivo
    l.motivo = null
    restante = c2(restante - passo!)
  }

  const totalEfetivo = c2(linhas.reduce((s, l) => s + l.efetivo, 0))
  return {
    modo,
    orcamento,
    linhas,
    totalEfetivo,
    sobra: c2(orcamento - totalEfetivo),
    porCategoria: distribuirPorCategoria(categorias, itens, linhas),
    categoriasVazias: categorias.filter((c) => c.percentual > 0 && !itens.some((i) => i.categoriaId === c.id)).map((c) => c.nome),
    somaPercentuais: categorias.reduce((s, c) => s + c.percentual, 0),
  }
}

/** Recalcula totais e distribuição depois de ajustes manuais nas linhas. */
export function recalcular(base: ResultadoSim, categorias: CategoriaSim[], itens: ItemSim[], linhas: LinhaSim[]): ResultadoSim {
  const totalEfetivo = c2(linhas.reduce((s, l) => s + l.efetivo, 0))
  return { ...base, linhas, totalEfetivo, sobra: c2(base.orcamento - totalEfetivo), porCategoria: distribuirPorCategoria(categorias, itens, linhas) }
}

function distribuirPorCategoria(categorias: CategoriaSim[], itens: ItemSim[], linhas: LinhaSim[]): DistribuicaoCat[] {
  const antesTotal = itens.reduce((s, i) => s + i.valorAtual, 0)
  const compras = linhas.reduce((s, l) => s + l.efetivo, 0)
  const somaPct = categorias.reduce((s, c) => s + c.percentual, 0) || 1
  return categorias.map((c) => {
    const valorAntes = itens.filter((i) => i.categoriaId === c.id).reduce((s, i) => s + i.valorAtual, 0)
    const daCat = linhas.filter((l) => l.item.categoriaId === c.id)
    const efetivoAporte = daCat.reduce((s, l) => s + l.efetivo, 0)
    const valorDepois = valorAntes + efetivoAporte
    return {
      id: c.id,
      nome: c.nome,
      meta: c.percentual / somaPct,
      antes: antesTotal > 0 ? valorAntes / antesTotal : 0,
      depois: antesTotal + compras > 0 ? valorDepois / (antesTotal + compras) : 0,
      valorAntes,
      valorDepois,
      idealAporte: daCat.reduce((s, l) => s + l.ideal, 0),
      efetivoAporte,
    }
  })
}

// ============ Prioridade de compra ============

export type NivelPrioridade = 'alta' | 'media' | 'equilibrado' | 'acima'

export interface Prioridade {
  id: string
  nome: string
  /** Frações 0–1. */
  meta: number
  atual: number
  /** atual − meta, em pontos percentuais. */
  desvioPP: number
  /** (meta − atual) ÷ meta: quanto falta, relativo à meta. */
  relativo: number
  /** R$ para chegar à meta considerando o aporte informado (nunca negativo: não sugere venda). */
  necessidade: number
  nivel: NivelPrioridade
  /** 0–1: combina desvio relativo (70%) e o peso da necessidade em R$ (30%). */
  pontuacao: number
  /** Dá para comprar ao menos uma unidade/mínimo com a necessidade (ou com o aporte)? */
  compravel: boolean | null
}

export const ROTULO_PRIORIDADE: Record<NivelPrioridade, string> = {
  alta: 'Alta — priorizar',
  media: 'Média — complementar',
  equilibrado: 'Equilibrado',
  acima: 'Acima da meta — aguardar',
}

export function nivelDe(relativo: number, desvioPP: number): NivelPrioridade {
  if (Math.abs(desvioPP) < 0.5) return 'equilibrado'
  if (relativo >= 0.25) return 'alta'
  if (relativo >= 0.1) return 'media'
  if (relativo > -0.1) return 'equilibrado'
  return 'acima'
}

/**
 * Prioridade de grupos (categorias ou ativos). `valores` = valor atual de cada grupo,
 * `metas` = fração-alvo (0–1), `aporte` = dinheiro novo considerado na necessidade.
 * Ordena da maior para a menor prioridade.
 */
export function calcularPrioridades(
  grupos: { id: string; nome: string; meta: number; valor: number; passoMinimo?: number | null }[],
  totalCarteira: number,
  aporte = 0,
): Prioridade[] {
  const base = totalCarteira + aporte
  const lista = grupos.map((g) => {
    const atual = totalCarteira > 0 ? g.valor / totalCarteira : 0
    const relativo = g.meta > 0 ? (g.meta - atual) / g.meta : atual > 0 ? -1 : 0
    const desvioPP = (atual - g.meta) * 100
    const necessidade = Math.max(0, g.meta * base - g.valor)
    const passo = g.passoMinimo ?? null
    return {
      id: g.id,
      nome: g.nome,
      meta: g.meta,
      atual,
      desvioPP,
      relativo,
      necessidade,
      nivel: nivelDe(relativo, desvioPP),
      pontuacao: 0,
      compravel: passo == null ? null : passo <= Math.max(necessidade, aporte) + 1e-9,
    }
  })
  const maxNec = Math.max(0, ...lista.map((p) => p.necessidade))
  for (const p of lista) {
    p.pontuacao = 0.7 * Math.max(-1, Math.min(1, p.relativo)) + 0.3 * (maxNec > 0 ? p.necessidade / maxNec : 0)
  }
  return lista.sort((a, b) => b.pontuacao - a.pontuacao || b.necessidade - a.necessidade)
}
