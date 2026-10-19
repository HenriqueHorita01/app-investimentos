// Minha Carteira — Acompanhamento (funções puras, sem acesso ao banco).
// Tudo sobre a parte "Investido" dos ativos (objetivos e reserva ficam fora), a partir dos
// lançamentos existentes: não há tabela de aportes do mês.
import { categoriaSugerida, type AtivoPlano, type Planejamento } from './carteiraPlano'
import { ehRendaVariavel, OBS_PROVENTOS_ANTERIORES, type Movimentacao } from './tipos'

export interface AtivoAcomp {
  id: string
  rotulo: string
  categoriaId: string | null
  rendaVariavel: boolean
  aplicado: number
  valor: number
  dividendos: number
}

export interface CategoriaAcomp {
  id: string | null
  nome: string
  cor: string
  /** % planejado da categoria (null = fora do plano). */
  alvo: number | null
  aplicado: number
  valor: number
}

export interface MesAcomp {
  /** "AAAA-MM" */
  mes: string
  aportes: number
  resgates: number
  dividendos: number
  /** Aportes − resgates acumulados até o fim do mês. */
  aplicadoAcumulado: number
}

export interface Acompanhamento {
  aplicado: number
  valor: number
  /** Valor atual − aplicado (rendimento da renda fixa + valorização da renda variável). */
  rendimento: number
  dividendos: number
  /** Rendimento + dividendos. */
  retornoTotal: number
  ativos: AtivoAcomp[]
  categorias: CategoriaAcomp[]
  meses: MesAcomp[]
  /** Dividendos lançados como "recebidos antes do cadastro" (sem mês real). */
  dividendosAnteriores: number
}

const ehProvento = (m: Movimentacao) => m.tipo === 'dividendo' || m.tipo === 'jcp'

/** Meses de `de` até `ate` ("AAAA-MM"), inclusive. */
export function mesesEntre(de: string, ate: string): string[] {
  const r: string[] = []
  let [a, m] = de.split('-').map(Number)
  const [aF, mF] = ate.split('-').map(Number)
  while (a < aF || (a === aF && m <= mF)) {
    r.push(`${a}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      a++
    }
  }
  return r
}

/**
 * `ativos`: todos os ativos com os lançamentos. Entram os que têm (ou tiveram) parte em
 * "Investido". Movimentações com destino (objetivo/reserva) são ignoradas.
 */
export function acompanhar(planejamento: Planejamento, ativos: { plano: AtivoPlano; movimentacoes: Movimentacao[] }[], hoje: string): Acompanhamento {
  const cats = planejamento.categorias.map((c) => c.categoria)
  const lista: AtivoAcomp[] = []
  const movsLivres: Movimentacao[] = []
  for (const { plano, movimentacoes } of ativos) {
    const livres = movimentacoes.filter((m) => m.objetivo_id == null)
    const temLivre = plano.valorLivre > 0.005 || plano.investidoLivre > 0.005 || livres.some((m) => m.tipo === 'aporte')
    if (!temLivre) continue
    movsLivres.push(...livres)
    const a = plano.ativo
    lista.push({
      id: a.id,
      rotulo: a.ticker || a.nome,
      categoriaId: a.categoria_id ?? categoriaSugerida(a.tipo, cats)?.id ?? null,
      rendaVariavel: ehRendaVariavel(a.tipo),
      aplicado: plano.investidoLivre,
      valor: plano.valorLivre,
      dividendos: livres.filter(ehProvento).reduce((s, m) => s + m.valor_total, 0),
    })
  }

  const soma = (f: (x: AtivoAcomp) => number, xs = lista) => xs.reduce((s, x) => s + f(x), 0)
  const aplicado = soma((x) => x.aplicado)
  const valor = soma((x) => x.valor)
  const dividendos = soma((x) => x.dividendos)

  const categorias: CategoriaAcomp[] = planejamento.categorias.map(({ categoria: c }) => {
    const daCat = lista.filter((x) => x.categoriaId === c.id)
    return { id: c.id, nome: c.nome, cor: c.cor ?? 'var(--positivo)', alvo: c.percentual, aplicado: soma((x) => x.aplicado, daCat), valor: soma((x) => x.valor, daCat) }
  })
  const semCat = lista.filter((x) => x.categoriaId == null || !cats.some((c) => c.id === x.categoriaId))
  if (semCat.some((x) => x.aplicado > 0.005 || x.valor > 0.005)) {
    categorias.push({ id: null, nome: 'Sem categoria', cor: 'var(--texto-2)', alvo: null, aplicado: soma((x) => x.aplicado, semCat), valor: soma((x) => x.valor, semCat) })
  }

  // Evolução mensal pelos lançamentos (aportes, resgates e dividendos em "Investido").
  const datadas = movsLivres.filter((m) => !(ehProvento(m) && m.observacao === OBS_PROVENTOS_ANTERIORES))
  const primeiro = datadas.map((m) => m.data).sort()[0]
  const meses: MesAcomp[] = []
  if (primeiro) {
    let acumulado = 0
    for (const mes of mesesEntre(primeiro.slice(0, 7), hoje.slice(0, 7))) {
      const doMes = datadas.filter((m) => m.data.startsWith(mes))
      const aportes = doMes.filter((m) => m.tipo === 'aporte').reduce((s, m) => s + m.valor_total, 0)
      const resgates = doMes.filter((m) => m.tipo === 'resgate' || m.tipo === 'amortizacao').reduce((s, m) => s + m.valor_total, 0)
      acumulado += aportes - resgates
      meses.push({ mes, aportes, resgates, dividendos: doMes.filter(ehProvento).reduce((s, m) => s + m.valor_total, 0), aplicadoAcumulado: acumulado })
    }
  }

  return {
    aplicado,
    valor,
    rendimento: valor - aplicado,
    dividendos,
    retornoTotal: valor - aplicado + dividendos,
    ativos: lista.sort((a, b) => b.aplicado - a.aplicado),
    categorias,
    meses,
    dividendosAnteriores: movsLivres.filter((m) => ehProvento(m) && m.observacao === OBS_PROVENTOS_ANTERIORES).reduce((s, m) => s + m.valor_total, 0),
  }
}

/**
 * Dividendos recebidos em "Investido" depois do último aporte — sugestão para somar ao
 * aporte do mês no simulador (não há caixa: é só um lembrete).
 */
export function dividendosDesdeUltimoAporte(movs: Movimentacao[]): { valor: number; desde: string | null } {
  const livres = movs.filter((m) => m.objetivo_id == null)
  const desde = livres.filter((m) => m.tipo === 'aporte').map((m) => m.data).sort().at(-1) ?? null
  const valor = livres
    .filter((m) => ehProvento(m) && m.observacao !== OBS_PROVENTOS_ANTERIORES && (desde == null || m.data > desde))
    .reduce((s, m) => s + m.valor_total, 0)
  return { valor, desde }
}
