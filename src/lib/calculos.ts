import type { Ativo, CdiDia, Movimentacao, Objetivo } from './tipos'
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
}

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
): Posicao {
  const proventos = movs.filter((m) => m.tipo === 'dividendo' || m.tipo === 'jcp').reduce((s, m) => s + valor(m), 0)
  return ehRendaVariavel(ativo.tipo)
    ? rendaVariavel(movs, ultimaCotacao, proventos)
    : rendaFixa(ativo, ordenar(movs), cdi, proventos)
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
  proventos: number,
): Posicao {
  const rende = ativo.indexador === 'cdi' && Number(ativo.taxa) > 0
  const percentual = Number(ativo.taxa ?? 0) / 100
  const saldos: Record<string, { saldo: number; custo: number }> = {}
  let inconsistente = false

  const aplicar = (m: Movimentacao) => {
    const d = destino(m)
    const s = (saldos[d] ??= { saldo: 0, custo: 0 })
    if (m.tipo === 'aporte') {
      s.saldo += valor(m)
      s.custo += valor(m)
    } else if (m.tipo === 'resgate' || m.tipo === 'amortizacao') {
      const r = valor(m)
      if (r > s.saldo + EPS) inconsistente = true
      // O custo sai na mesma proporção do saldo resgatado.
      s.custo -= s.saldo > 0 ? s.custo * Math.min(1, r / s.saldo) : 0
      s.saldo -= r
      if (Math.abs(s.saldo) < EPS) s.saldo = 0
    } else if (m.tipo === 'ajuste') {
      // Ajuste de saldo: rendimento anterior ao cadastro ou correção pelo extrato.
      // Mexe no saldo, não no custo (pode ser negativo).
      s.saldo += valor(m)
      if (s.saldo < -EPS) inconsistente = true
    }
  }

  let i = 0
  if (rende && movs.length) {
    for (const dia of cdi) {
      if (dia.data < movs[0].data) continue
      if (ativo.vencimento && dia.data >= ativo.vencimento) break
      while (i < movs.length && movs[i].data <= dia.data) aplicar(movs[i++])
      const fator = 1 + (Number(dia.taxa_dia) / 100) * percentual
      for (const s of Object.values(saldos)) if (s.saldo > 0) s.saldo *= fator
    }
  }
  while (i < movs.length) aplicar(movs[i++])

  const porDestino: Record<string, Parcela> = {}
  let valorAtual = 0
  let investido = 0
  for (const [d, s] of Object.entries(saldos)) {
    valorAtual += s.saldo
    investido += s.custo
    if (Math.abs(s.saldo) >= EPS) porDestino[d] = { quantidade: 0, investido: s.custo, valorAtual: s.saldo }
  }
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
    semRendimento: !rende,
    porDestino,
    inconsistente,
  }
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
): { calculado: number; ajustes: { objetivo_id: string | null; valor: number }[] } {
  const p = calcularPosicao(
    ativo,
    movs.filter((m) => m.data <= data),
    null,
    cdi.filter((d) => d.data < data),
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
): RendimentoMes {
  const zero = { realizado: 0, projetado: 0, total: 0, ritmoMensal: 0 }
  if (ehRendaVariavel(ativo.tipo) || ativo.indexador !== 'cdi' || !(Number(ativo.taxa) > 0) || !movs.length) return zero
  const inicioMes = hoje.slice(0, 8) + '01'
  const agora = calcularPosicao(ativo, movs, null, cdi)
  const semMes = calcularPosicao(ativo, movs, null, cdi.filter((d) => d.data < inicioMes))
  const realizado = agora.valorAtual - semMes.valorAtual

  const ultimo = cdiAtual
  if (!ultimo || agora.valorAtual <= 0) return { ...zero, realizado, total: realizado }
  const fatorDia = 1 + (Number(ultimo.taxa_dia) / 100) * (Number(ativo.taxa) / 100)
  const fimMes = ultimoDiaDoMes(hoje)
  const venceAntes = ativo.vencimento && ativo.vencimento <= fimMes
  // Projeta a partir do dia seguinte ao último CDI publicado, sem contar dias
  // antes do início do mês nem antes da primeira aplicação.
  const primeira = movs.reduce((min, m) => (m.data < min ? m.data : min), movs[0].data)
  const inicio = [ultimo.data, proximoDiaAnterior(inicioMes), proximoDiaAnterior(primeira)].sort().at(-1)!
  const dias = diasUteisEntre(inicio, venceAntes ? ativo.vencimento! : fimMes)
  const projetado = agora.valorAtual * (fatorDia ** dias - 1)
  return { realizado, projetado, total: realizado + projetado, ritmoMensal: agora.valorAtual * (fatorDia ** 21 - 1) }
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
  }
  // CDI de hoje ainda não entra: ele rende por cima do saldo informado.
  const calculado = calcularPosicao(ativo, [aporte], null, cdi.filter((d) => d.data < hoje)).valorAtual
  return { data: hoje, valor: Math.round((saldoHoje - calculado) * 100) / 100 }
}
