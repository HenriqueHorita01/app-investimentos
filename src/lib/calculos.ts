import type { Ativo, CdiDia, Indexador, Movimentacao, Objetivo } from './tipos'
import { ehRendaVariavel } from './tipos'

/** Chave do destino "livre" (lançamentos sem objetivo). */
export const LIVRE = 'livre'

/** Parte de um ativo que pertence a um destino (livre ou um objetivo). */
export interface Parcela {
  /** Cotas (renda variável). 0 na renda fixa. */
  quantidade: number
  /** Custo dessa parte. */
  investido: number
  valorAtual: number
}

/** Posição consolidada de um ativo — regras da seção 4 do SPEC. */
export interface Posicao {
  quantidade: number
  /** Custo total das compras ÷ quantidade comprada. Resgate não altera. */
  custoMedio: number
  /** Custo da posição atual (quantidade × custo médio; renda fixa: aplicado líquido). */
  investido: number
  /** null quando não há cotação (renda variável) ou para renda fixa. */
  cotacao: number | null
  /** Renda variável: quantidade × última cotação. Renda fixa: saldo bruto pelo CDI. */
  valorAtual: number
  /** Valor atual − investido (renda fixa: rendimento bruto). */
  variacao: number
  /** variação ÷ investido (fração). */
  variacaoPercentual: number
  /** Σ dividendos + JCP recebidos. */
  proventos: number
  /** variação + proventos recebidos. */
  retornoTotal: number
  semCotacao: boolean
  /** Renda fixa sem cálculo automático (indexador diferente de CDI). */
  semRendimento: boolean
  /** Divisão por destino: LIVRE ou id do objetivo. */
  porDestino: Record<string, Parcela>
  /** Algum destino ficou negativo (resgate maior que o disponível). */
  inconsistente: boolean
  /** Renda fixa: cada aplicação (lote) com as condições e o saldo dela. */
  lotes: Lote[]
}

/** Uma aplicação de renda fixa (um aporte), com condições próprias. */
export interface Lote {
  movId: string
  data: string
  destino: string
  criadoEm: string
  /** Valor aplicado originalmente. */
  aplicado: number
  /** Custo que ainda resta (cai na proporção dos resgates). */
  custo: number
  /** Saldo bruto atual. */
  saldo: number
  indexador: Indexador
  taxa: number | null
  vencimento: string | null
  liquidez: string | null
  carencia: string | null
  /** Usou IPCA projetado em algum mês ainda não divulgado. */
  ipcaEstimado: boolean
}

/** IPCA mensal: "AAAA-MM" → variação % no mês. */
export type SerieIpca = Map<string, number>

const qtd = (m: Movimentacao) => Number(m.quantidade ?? 0)
const valor = (m: Movimentacao) => Number(m.valor_total ?? 0)
const destino = (m: Movimentacao) => m.objetivo_id ?? LIVRE
const EPS = 0.005

function ordenar(movs: Movimentacao[]) {
  return [...movs].sort((a, b) => (a.data === b.data ? a.criado_em.localeCompare(b.criado_em) : a.data < b.data ? -1 : 1))
}

export function calcularPosicao(
  ativo: Pick<Ativo, 'tipo' | 'indexador' | 'taxa' | 'vencimento'>,
  movs: Movimentacao[],
  ultimaCotacao: number | null,
  cdi: CdiDia[] = [],
  ipca: SerieIpca = new Map(),
): Posicao {
  const proventos = movs.filter((m) => m.tipo === 'dividendo' || m.tipo === 'jcp').reduce((s, m) => s + valor(m), 0)
  return ehRendaVariavel(ativo.tipo)
    ? rendaVariavel(movs, ultimaCotacao, proventos)
    : rendaFixa(ativo, ordenar(movs), cdi, ipca, proventos)
}

function rendaVariavel(movs: Movimentacao[], ultimaCotacao: number | null, proventos: number): Posicao {
  const cotas: Record<string, number> = {}
  let qtdComprada = 0
  let custoCompras = 0
  for (const m of movs) {
    const d = destino(m)
    if (m.tipo === 'aporte') {
      cotas[d] = (cotas[d] ?? 0) + qtd(m)
      qtdComprada += qtd(m)
      custoCompras += valor(m)
    } else if (m.tipo === 'resgate') {
      cotas[d] = (cotas[d] ?? 0) - qtd(m)
    } else if (m.tipo === 'ajuste') {
      cotas[d] = (cotas[d] ?? 0) + qtd(m)
    }
  }
  const custoMedio = qtdComprada > 0 ? custoCompras / qtdComprada : 0
  const preco = ultimaCotacao ?? custoMedio
  const porDestino: Record<string, Parcela> = {}
  let quantidade = 0
  let inconsistente = false
  for (const [d, q0] of Object.entries(cotas)) {
    const q = Math.round(q0 * 1e6) / 1e6
    if (q < 0) inconsistente = true
    quantidade += q
    if (q !== 0) porDestino[d] = { quantidade: q, investido: q * custoMedio, valorAtual: q * preco }
  }
  quantidade = Math.round(quantidade * 1e6) / 1e6
  const investido = quantidade * custoMedio
  const valorAtual = quantidade * preco
  const variacao = valorAtual - investido
  return {
    quantidade,
    custoMedio,
    investido,
    cotacao: ultimaCotacao,
    valorAtual,
    variacao,
    variacaoPercentual: investido > 0 ? variacao / investido : 0,
    proventos,
    retornoTotal: variacao + proventos,
    semCotacao: ultimaCotacao == null,
    semRendimento: false,
    porDestino,
    inconsistente,
    lotes: [],
  }
}

/**
 * Renda fixa pós-fixada (% do CDI), SPEC §4:
 * fator do dia = 1 + CDI do dia × percentual; saldo = aplicado × Π fatores desde a aplicação.
 * Cada destino tem seu próprio saldo corrido, então o rendimento da parte reservada
 * fica no objetivo. O CDI do dia D vale para o dinheiro aplicado até D (inclusive).
 */
function rendaFixa(
  ativo: Pick<Ativo, 'indexador' | 'taxa' | 'vencimento'>,
  movs: Movimentacao[],
  cdi: CdiDia[],
  ipca: SerieIpca,
  proventos: number,
): Posicao {
  const lotes: Lote[] = []
  let inconsistente = false

  const novoLote = (m: Movimentacao, destino: string, aplicado: number, saldo: number): Lote => {
    const l: Lote = {
      movId: m.id,
      data: m.data,
      destino,
      criadoEm: m.criado_em,
      aplicado,
      custo: aplicado,
      saldo,
      // Condições da aplicação; vazias herdam do ativo.
      indexador: m.indexador ?? ativo.indexador,
      taxa: m.taxa != null ? Number(m.taxa) : ativo.taxa != null ? Number(ativo.taxa) : null,
      vencimento: m.vencimento ?? ativo.vencimento,
      liquidez: m.liquidez ?? null,
      carencia: m.carencia ?? null,
      ipcaEstimado: false,
    }
    lotes.push(l)
    return l
  }

  const aplicar = (m: Movimentacao) => {
    const d = destino(m)
    const doDestino = lotes.filter((l) => l.destino === d)
    if (m.tipo === 'aporte') {
      novoLote(m, d, valor(m), valor(m))
    } else if (m.tipo === 'resgate' || m.tipo === 'amortizacao') {
      // PEPS: sai primeiro das aplicações mais antigas; o custo cai na proporção.
      let r = valor(m)
      for (const l of doDestino) {
        if (r <= EPS) break
        if (l.saldo <= EPS) continue
        const tirar = Math.min(r, l.saldo)
        l.custo -= l.custo * (tirar / l.saldo)
        l.saldo -= tirar
        if (l.saldo < EPS) l.saldo = 0
        r -= tirar
      }
      if (r > EPS) inconsistente = true
    } else if (m.tipo === 'ajuste') {
      // Rendimento anterior ao cadastro: vai para a aplicação lançada junto com ele.
      // Correção pelo extrato: divide entre as aplicações do destino pelo saldo.
      const v = valor(m)
      const doLote = doDestino.find((l) => l.criadoEm === m.criado_em)
      const comSaldo = doDestino.filter((l) => l.saldo > EPS)
      const total = comSaldo.reduce((s, l) => s + l.saldo, 0)
      if (doLote) doLote.saldo += v
      else if (total > 0) for (const l of comSaldo) l.saldo += v * (l.saldo / total)
      else novoLote(m, d, 0, v)
      if (doDestino.some((l) => l.saldo < -EPS)) inconsistente = true
    }
  }

  let i = 0
  if (movs.length) {
    for (const dia of cdi) {
      if (dia.data < movs[0].data) continue
      while (i < movs.length && movs[i].data <= dia.data) aplicar(movs[i++])
      for (const l of lotes) {
        if (l.saldo <= 0 || (l.vencimento && dia.data >= l.vencimento)) continue
        const f = fatorDoDia(l, dia, ipca)
        l.saldo *= f.fator
        if (f.ipcaEstimado) l.ipcaEstimado = true
      }
    }
  }
  while (i < movs.length) aplicar(movs[i++])

  const porDestino: Record<string, Parcela> = {}
  let valorAtual = 0
  let investido = 0
  for (const l of lotes) {
    valorAtual += l.saldo
    investido += l.custo
    const p = (porDestino[l.destino] ??= { quantidade: 0, investido: 0, valorAtual: 0 })
    p.investido += l.custo
    p.valorAtual += l.saldo
  }
  for (const [d, p] of Object.entries(porDestino)) if (Math.abs(p.valorAtual) < EPS) delete porDestino[d]
  const variacao = valorAtual - investido
  return {
    quantidade: 0,
    custoMedio: 0,
    investido,
    cotacao: null,
    valorAtual,
    variacao,
    variacaoPercentual: investido > 0 ? variacao / investido : 0,
    proventos,
    retornoTotal: variacao + proventos,
    semCotacao: false,
    semRendimento: !lotes.some(rendeAutomatico) && !(lotes.length === 0 && rendeAutomatico({ indexador: ativo.indexador, taxa: ativo.taxa })),
    porDestino,
    inconsistente,
    lotes,
  }
}

/** O app calcula o rendimento desta aplicação sozinho? (CDI precisa de taxa.) */
export function rendeAutomatico(l: Pick<Lote, 'indexador' | 'taxa'>): boolean {
  if (l.indexador === 'cdi') return Number(l.taxa) > 0
  return l.indexador === 'ipca' || l.indexador === 'pre' || l.indexador === 'selic'
}

/** Dias úteis num mês "AAAA-MM" (seg–sex, sem feriados fixos). */
const cacheDiasUteis = new Map<string, number>()
function diasUteisDoMes(mes: string): number {
  let n = cacheDiasUteis.get(mes)
  if (n == null) {
    const [a, m] = mes.split('-').map(Number)
    const anterior = new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10)
    const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
    n = Math.max(1, diasUteisEntre(anterior, ultimo))
    cacheDiasUteis.set(mes, n)
  }
  return n
}

/** IPCA do mês; se ainda não divulgado, usa o último conhecido (estimativa). */
function ipcaDoMes(mes: string, ipca: SerieIpca): { variacao: number; estimado: boolean } {
  const v = ipca.get(mes)
  if (v != null) return { variacao: v, estimado: false }
  let ultimoMes = ''
  for (const k of ipca.keys()) if (k < mes && k > ultimoMes) ultimoMes = k
  return { variacao: ultimoMes ? (ipca.get(ultimoMes) ?? 0) : 0, estimado: true }
}

/**
 * Fator de um dia útil para uma aplicação:
 * - % do CDI: 1 + CDI do dia × percentual;
 * - Prefixado: (1 + taxa a.a.)^(1/252);
 * - Selic: (1 + CDI do dia) × (1 + taxa adicional)^(1/252) (CDI ≈ Selic);
 * - IPCA +: (1 + IPCA do mês)^(1/dias úteis do mês) × (1 + taxa real)^(1/252) — "na curva".
 */
export function fatorDoDia(l: Pick<Lote, 'indexador' | 'taxa'>, dia: CdiDia, ipca: SerieIpca): { fator: number; ipcaEstimado: boolean } {
  const taxa = Number(l.taxa ?? 0) / 100
  const cdiDia = Number(dia.taxa_dia) / 100
  switch (l.indexador) {
    case 'cdi':
      return { fator: taxa > 0 ? 1 + cdiDia * taxa : 1, ipcaEstimado: false }
    case 'pre':
      return { fator: (1 + taxa) ** (1 / 252), ipcaEstimado: false }
    case 'selic':
      return { fator: (1 + cdiDia) * (1 + taxa) ** (1 / 252), ipcaEstimado: false }
    case 'ipca': {
      const mes = dia.data.slice(0, 7)
      const { variacao, estimado } = ipcaDoMes(mes, ipca)
      return { fator: (1 + variacao / 100) ** (1 / diasUteisDoMes(mes)) * (1 + taxa) ** (1 / 252), ipcaEstimado: estimado }
    }
    default:
      return { fator: 1, ipcaEstimado: false }
  }
}

// ============ Tributação por aplicação ============

/** IOF regressivo (% do rendimento) por dias corridos de aplicação: dia 1 = 96% … dia 29 = 3%, 30+ = 0. */
const TABELA_IOF = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3]

/** Alíquota do IR regressivo da renda fixa pelo prazo da aplicação (dias corridos). */
export function aliquotaIR(dias: number): number {
  if (dias <= 180) return 0.225
  if (dias <= 360) return 0.2
  if (dias <= 720) return 0.175
  return 0.15
}

export function aliquotaIOF(dias: number): number {
  if (dias >= 30) return 0
  return TABELA_IOF[Math.max(1, dias) - 1] / 100
}

export function diasCorridos(de: string, ate: string): number {
  return Math.round((Date.parse(ate + 'T12:00:00Z') - Date.parse(de + 'T12:00:00Z')) / 86400000)
}

export interface Tributacao {
  dias: number
  rendimento: number
  /** Isenta de IR/IOF (LCI/LCA para pessoa física). */
  isenta: boolean
  aliquotaIR: number
  iof: number
  ir: number
  /** Saldo líquido estimado se resgatar em `hoje`. */
  liquido: number
}

/**
 * Estimativa de IR e IOF de UMA aplicação se resgatada em `hoje` (cada aplicação tem
 * o seu prazo; não usa uma alíquota única para o grupo). IOF primeiro, IR sobre o resto.
 * LCI/LCA: isentas para pessoa física.
 */
export function tributacaoDoLote(l: Pick<Lote, 'data' | 'saldo' | 'custo'>, hoje: string, isenta: boolean): Tributacao {
  const dias = diasCorridos(l.data, hoje)
  const rendimento = l.saldo - l.custo
  if (isenta || rendimento <= 0) {
    return { dias, rendimento, isenta, aliquotaIR: isenta ? 0 : aliquotaIR(dias), iof: 0, ir: 0, liquido: l.saldo }
  }
  const iof = rendimento * aliquotaIOF(dias)
  const ir = (rendimento - iof) * aliquotaIR(dias)
  return { dias, rendimento, isenta, aliquotaIR: aliquotaIR(dias), iof, ir, liquido: l.saldo - iof - ir }
}

/** Quanto do destino está disponível para resgate (cotas na RV, reais na RF). */
export function disponivel(p: Posicao, rendaVariavel: boolean, dest: string): number {
  const parcela = p.porDestino[dest]
  if (!parcela) return 0
  return rendaVariavel ? parcela.quantidade : parcela.valorAtual
}

export interface ItemResumo {
  tipo: Ativo['tipo']
  posicao: Posicao
}

export interface Resumo {
  /**
   * Patrimônio livre = só o excedente gerado pelos investimentos de longo prazo:
   * rendimento da renda fixa (saldo − aplicado, parte livre) + dividendos/JCP de ações e FIIs.
   * O dinheiro investido, a valorização das cotas, a reserva de emergência e o que está
   * reservado para objetivos ficam de fora.
   */
  patrimonio: number
  /** Rendimento bruto da renda fixa (parte livre). */
  rendimentoRendaFixa: number
  /** Dividendos e JCP recebidos (ações/FIIs da carteira). */
  proventos: number
  /** Custo do que está investido a longo prazo (parte livre). */
  investido: number
  /** Valor atual do que está investido a longo prazo (parte livre). */
  valorInvestido: number
  /** Valorização das cotas de ações/FIIs (parte livre), não realizada. */
  valorizacao: number
  /** Reservado para objetivos (conta como investimento, não como patrimônio). */
  reservado: number
  reservadoInvestido: number
  /** Parte destinada à reserva de emergência (aba própria, fora do patrimônio). */
  reservaEmergencia: number
  reservaInvestido: number
}

/** `reservaId`: id do destino reserva de emergência (null se o usuário não tem). */
export function resumir(itens: ItemResumo[], reservaId: string | null): Resumo {
  const r: Resumo = {
    patrimonio: 0,
    rendimentoRendaFixa: 0,
    proventos: 0,
    investido: 0,
    valorInvestido: 0,
    valorizacao: 0,
    reservado: 0,
    reservadoInvestido: 0,
    reservaEmergencia: 0,
    reservaInvestido: 0,
  }
  for (const { tipo, posicao: p } of itens) {
    r.proventos += p.proventos
    const rv = ehRendaVariavel(tipo)
    for (const [d, parcela] of Object.entries(p.porDestino)) {
      if (d === LIVRE) {
        r.investido += parcela.investido
        r.valorInvestido += parcela.valorAtual
        if (rv) r.valorizacao += parcela.valorAtual - parcela.investido
        else r.rendimentoRendaFixa += parcela.valorAtual - parcela.investido
      } else if (d === reservaId) {
        r.reservaEmergencia += parcela.valorAtual
        r.reservaInvestido += parcela.investido
      } else {
        r.reservado += parcela.valorAtual
        r.reservadoInvestido += parcela.investido
      }
    }
  }
  r.patrimonio = r.rendimentoRendaFixa + r.proventos
  return r
}

export interface UsoNoObjetivo {
  ativoId: string
  rotulo: string
  valorAtual: number
  investido: number
}

export interface ProgressoObjetivo {
  objetivo: Objetivo
  valorAtual: number
  investido: number
  /** valor atual ÷ valor-alvo (fração, pode passar de 1). */
  progresso: number
  ativos: UsoNoObjetivo[]
}

export function progressoObjetivos(
  objetivos: Objetivo[],
  ativos: { id: string; rotulo: string; posicao: Posicao }[],
): ProgressoObjetivo[] {
  return objetivos.map((o) => {
    const usos = ativos
      .filter((a) => a.posicao.porDestino[o.id])
      .map((a) => ({ ativoId: a.id, rotulo: a.rotulo, ...a.posicao.porDestino[o.id] }))
    const valorAtual = usos.reduce((s, u) => s + u.valorAtual, 0)
    const investido = usos.reduce((s, u) => s + u.investido, 0)
    return {
      objetivo: o,
      valorAtual,
      investido,
      progresso: o.valor_alvo && o.valor_alvo > 0 ? valorAtual / o.valor_alvo : 0,
      ativos: usos.map(({ ativoId, rotulo, valorAtual, investido }) => ({ ativoId, rotulo, valorAtual, investido })),
    }
  })
}

/**
 * Renda fixa: ajustes necessários para que o saldo bruto no início do dia `data`
 * fique igual ao saldo do extrato. O CDI do próprio dia ainda não conta; ele entra
 * por cima do saldo corrigido. A diferença é dividida entre os destinos (livre e
 * objetivos) na proporção do saldo de cada um.
 */
export function ajustesParaSaldo(
  ativo: Pick<Ativo, 'tipo' | 'indexador' | 'taxa' | 'vencimento'>,
  movs: Movimentacao[],
  cdi: CdiDia[],
  data: string,
  saldoExtrato: number,
  ipca: SerieIpca = new Map(),
): { calculado: number; ajustes: { objetivo_id: string | null; valor: number }[] } {
  const p = calcularPosicao(
    ativo,
    movs.filter((m) => m.data <= data),
    null,
    cdi.filter((d) => d.data < data),
    ipca,
  )
  const calculado = p.valorAtual
  const diferenca = Math.round((saldoExtrato - calculado) * 100) / 100
  if (Math.abs(diferenca) < 0.01) return { calculado, ajustes: [] }
  const partes = Object.entries(p.porDestino).filter(([, x]) => x.valorAtual > 0)
  if (!partes.length) return { calculado, ajustes: [{ objetivo_id: null, valor: diferenca }] }
  // Distribui em centavos; o resto do arredondamento fica na última parte.
  let restante = diferenca
  const ajustes = partes.map(([d, x], i) => {
    const v = i === partes.length - 1 ? restante : Math.round(diferenca * (x.valorAtual / calculado) * 100) / 100
    restante = Math.round((restante - v) * 100) / 100
    return { objetivo_id: d === LIVRE ? null : d, valor: v }
  })
  return { calculado, ajustes: ajustes.filter((a) => a.valor !== 0) }
}

// ============ Rendimento do mês (renda fixa) ============

/** Feriados nacionais de data fixa (MM-DD). Os móveis (Carnaval etc.) ficam de fora: é estimativa. */
const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']

function proximoDia(iso: string) {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Dias úteis (seg–sex, sem feriados fixos) depois de `apos` até `ate`, inclusive. */
export function diasUteisEntre(apos: string, ate: string): number {
  let n = 0
  for (let d = proximoDia(apos); d <= ate; d = proximoDia(d)) {
    const semana = new Date(d + 'T12:00:00Z').getUTCDay()
    if (semana !== 0 && semana !== 6 && !FERIADOS_FIXOS.includes(d.slice(5))) n++
  }
  return n
}

export function ultimoDiaDoMes(iso: string): string {
  const [a, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

export interface RendimentoMes {
  /** Quanto já rendeu no mês, pelos CDIs publicados. */
  realizado: number
  /** Estimativa para os dias úteis que faltam (CDI mais recente). */
  projetado: number
  /** realizado + projetado. */
  total: number
  /** Rendimento de um mês típico (21 dias úteis) no saldo e CDI atuais. */
  ritmoMensal: number
}

/**
 * Rendimento no mês de `hoje` para uma aplicação atrelada ao CDI.
 * Realizado = crescimento do saldo pelos CDIs do mês (aportes e ajustes não contam).
 */
export function rendimentoNoMes(
  ativo: Pick<Ativo, 'tipo' | 'indexador' | 'taxa' | 'vencimento'>,
  movs: Movimentacao[],
  cdi: CdiDia[],
  hoje: string,
  /** CDI mais recente publicado (a série `cdi` pode começar depois dele). */
  cdiAtual: CdiDia | null = cdi.length ? cdi[cdi.length - 1] : null,
  ipca: SerieIpca = new Map(),
): RendimentoMes {
  const zero = { realizado: 0, projetado: 0, total: 0, ritmoMensal: 0 }
  if (ehRendaVariavel(ativo.tipo) || !movs.length) return zero
  const inicioMes = hoje.slice(0, 8) + '01'
  const agora = calcularPosicao(ativo, movs, null, cdi, ipca)
  if (!agora.lotes.some(rendeAutomatico)) return zero
  const semMes = calcularPosicao(ativo, movs, null, cdi.filter((d) => d.data < inicioMes), ipca)
  const realizado = agora.valorAtual - semMes.valorAtual

  const ultimo = cdiAtual
  if (!ultimo || agora.valorAtual <= 0) return { ...zero, realizado, total: realizado }
  const fimMes = ultimoDiaDoMes(hoje)
  // Cada aplicação projeta com a própria taxa, a partir do dia seguinte ao último CDI
  // publicado, sem contar dias antes do início do mês nem antes da aplicação, e até o
  // vencimento dela.
  let projetado = 0
  let ritmoMensal = 0
  for (const l of agora.lotes) {
    if (l.saldo <= 0 || !rendeAutomatico(l)) continue
    const f = fatorDoDia(l, { data: hoje, taxa_dia: ultimo.taxa_dia }, ipca).fator
    const inicio = [ultimo.data, proximoDiaAnterior(inicioMes), proximoDiaAnterior(l.data)].sort().at(-1)!
    const ate = l.vencimento && l.vencimento <= fimMes ? l.vencimento : fimMes
    projetado += l.saldo * (f ** diasUteisEntre(inicio, ate) - 1)
    if (!l.vencimento || l.vencimento > hoje) ritmoMensal += l.saldo * (f ** 21 - 1)
  }
  return { realizado, projetado, total: realizado + projetado, ritmoMensal }
}

function proximoDiaAnterior(iso: string) {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Aplicação antiga de renda fixa: o usuário informa a data em que aplicou, o valor
 * aplicado e o saldo bruto de HOJE. O aporte fica na data da aplicação (idade do lote) e
 * a diferença entre o saldo de hoje e o que o app calcula pelo CDI vira um ajuste com
 * data de hoje — assim o CDI do passado não é contado duas vezes.
 */
export function ajusteAplicacaoAntiga(
  ativo: Pick<Ativo, 'tipo' | 'indexador' | 'taxa' | 'vencimento'>,
  dataAplicacao: string,
  valorAplicado: number,
  saldoHoje: number,
  cdi: CdiDia[],
  hoje: string,
  /** Condições próprias desta aplicação (taxa, indexador, vencimento), se houver. */
  condicoes: Pick<Movimentacao, 'taxa' | 'indexador' | 'vencimento'> = {},
  ipca: SerieIpca = new Map(),
): { data: string; valor: number } {
  const aporte: Movimentacao = {
    id: 'novo',
    ativo_id: 'novo',
    data: dataAplicacao,
    tipo: 'aporte',
    quantidade: null,
    preco_unitario: null,
    valor_total: valorAplicado,
    observacao: null,
    objetivo_id: null,
    criado_em: '',
    ...condicoes,
  }
  // CDI de hoje ainda não entra: ele rende por cima do saldo informado.
  const calculado = calcularPosicao(ativo, [aporte], null, cdi.filter((d) => d.data < hoje), ipca).valorAtual
  return { data: hoje, valor: Math.round((saldoHoje - calculado) * 100) / 100 }
}
