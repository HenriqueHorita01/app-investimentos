import { useState } from 'react'
import { projetarSaldo, tributacaoDoLote, type Lote } from '../lib/calculos'
import { formatarBRL, formatarBRLComSinal, formatarData, formatarPercentual, lerNumero } from '../lib/formato'
import { CARENCIA_NEON_DIAS, faixaEm, inicioDaFaixa, PRESET_NEON, proximaFaixa, somarMeses, descreverFaixas, type ConfigProgressiva } from '../lib/progressiva'
import { INDEXADORES, type Ativo, type Indexador } from '../lib/tipos'
import { Campo, corSinal } from './ui'

// ============ Formulário: tipo de rentabilidade ============

export type TipoRentabilidade = 'pre' | 'cdi' | 'selic' | 'ipca' | 'progressiva'

export const TIPOS_RENTABILIDADE: { id: TipoRentabilidade; nome: string }[] = [
  { id: 'pre', nome: 'Prefixada (% a.a.)' },
  { id: 'cdi', nome: 'Pós-fixada (% do CDI)' },
  { id: 'selic', nome: 'Pós-fixada (Selic +)' },
  { id: 'ipca', nome: 'Híbrida (IPCA +)' },
  { id: 'progressiva', nome: 'Progressiva (% do CDI por prazo)' },
]

interface FaixaTexto {
  inicio: string
  unidade: 'dias' | 'meses'
  percentual: string
}

export interface EstadoRentabilidade {
  tipo: TipoRentabilidade
  taxa: string
  faixas: FaixaTexto[]
  retroativa: boolean
  contagem: 'individual' | 'compartilhada'
  carencia: string
}

const txt = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','))
const faixasTexto = (c: ConfigProgressiva): FaixaTexto[] => c.faixas.map((f) => ({ inicio: String(f.inicio), unidade: f.unidade, percentual: txt(f.percentual) }))

export function estadoRentabilidade(a?: Pick<Ativo, 'indexador' | 'taxa' | 'progressiva' | 'carencia_dias'>, padrao: Indexador = 'cdi'): EstadoRentabilidade {
  const cfg = a?.progressiva ?? null
  const idx = a && a.indexador !== 'nenhum' ? a.indexador : padrao
  return {
    tipo: cfg ? 'progressiva' : (idx as TipoRentabilidade),
    taxa: txt(a?.taxa),
    faixas: faixasTexto(cfg ?? PRESET_NEON),
    retroativa: cfg?.retroativa ?? true,
    contagem: cfg?.contagem ?? 'individual',
    carencia: a?.carencia_dias != null ? String(a.carencia_dias) : '',
  }
}

export type CamposRentabilidade = Pick<Ativo, 'indexador' | 'taxa' | 'progressiva' | 'carencia_dias'>

/** Converte o formulário nos campos do ativo, ou devolve a mensagem de erro. */
export function lerRentabilidade(e: EstadoRentabilidade): CamposRentabilidade | string {
  const carencia = e.carencia.trim() ? Number(e.carencia) : null
  if (carencia != null && !(Number.isInteger(carencia) && carencia >= 0)) return 'Carência inválida (dias corridos, ex.: 30).'
  if (e.tipo === 'progressiva') {
    const faixas = e.faixas.map((f) => ({ inicio: Number(f.inicio), unidade: f.unidade, percentual: lerNumero(f.percentual) }))
    if (!faixas.length) return 'Inclua pelo menos uma faixa.'
    if (faixas.some((f) => !Number.isInteger(f.inicio) || f.inicio < 0)) return 'O início de cada faixa deve ser um número inteiro de dias ou meses.'
    if (faixas.some((f) => !(f.percentual > 0))) return 'Informe o % do CDI de cada faixa.'
    if (faixas[0].inicio !== 0) return 'A primeira faixa deve começar em 0 (data da aplicação).'
    const ordem = faixas.map((f) => (f.unidade === 'meses' ? f.inicio * 30.4375 : f.inicio))
    if (ordem.some((v, i) => i > 0 && v <= ordem[i - 1])) return 'As faixas devem estar em ordem crescente de prazo.'
    return {
      indexador: 'cdi',
      taxa: faixas[0].percentual,
      progressiva: { faixas, retroativa: e.retroativa, contagem: e.contagem },
      carencia_dias: carencia,
    }
  }
  const idx = INDEXADORES.find((i) => i.id === e.tipo)!
  const taxa = e.taxa.trim() ? lerNumero(e.taxa) : null
  if (taxa != null && Number.isNaN(taxa)) return 'Taxa inválida.'
  if (idx.taxaObrigatoria && !(taxa != null && taxa > 0)) return `Informe a taxa (${idx.rotuloTaxa}). Ex.: ${idx.exemplo}.`
  return { indexador: e.tipo, taxa, progressiva: null, carencia_dias: carencia }
}

/** Tipo de rentabilidade + taxa (ou faixas) + carência. O vencimento fica no formulário do ativo. */
export function EditorRentabilidade({ id, valor, mudar }: { id: string; valor: EstadoRentabilidade; mudar: (e: EstadoRentabilidade) => void }) {
  const set = (p: Partial<EstadoRentabilidade>) => mudar({ ...valor, ...p })
  const setFaixa = (i: number, p: Partial<FaixaTexto>) => set({ faixas: valor.faixas.map((f, k) => (k === i ? { ...f, ...p } : f)) })
  const idx = INDEXADORES.find((i) => i.id === valor.tipo)
  return (
    <>
      <Campo id={`${id}-rent`} rotulo="Tipo de rentabilidade">
        <select id={`${id}-rent`} className="campo" value={valor.tipo} onChange={(e) => set({ tipo: e.target.value as TipoRentabilidade })}>
          {TIPOS_RENTABILIDADE.map((t) => (
            <option key={t.id} value={t.id}>{t.nome}</option>
          ))}
        </select>
      </Campo>

      {valor.tipo !== 'progressiva' && idx && (
        <Campo id={`${id}-taxa`} rotulo={idx.rotuloTaxa}>
          <input id={`${id}-taxa`} className="campo font-mono" inputMode="decimal" placeholder={idx.exemplo} value={valor.taxa} onChange={(e) => set({ taxa: e.target.value })} />
        </Campo>
      )}

      {valor.tipo === 'progressiva' && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-linha p-3">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[13px] font-bold">Faixas por tempo de aplicação</div>
            <button
              type="button"
              className="text-xs font-bold text-positivo"
              onClick={() => set({ faixas: faixasTexto(PRESET_NEON), retroativa: true, contagem: 'individual', carencia: valor.carencia || String(CARENCIA_NEON_DIAS) })}
            >
              Usar CDB Neon
            </button>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1.5 text-[11px] text-texto-2">
            <span>A partir de</span>
            <span>Unidade</span>
            <span>% do CDI</span>
            <span />
          </div>
          {valor.faixas.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1.5">
              <input
                aria-label={`Início da faixa ${i + 1}`}
                className="campo !px-2 font-mono"
                inputMode="numeric"
                value={f.inicio}
                disabled={i === 0}
                onChange={(e) => setFaixa(i, { inicio: e.target.value.replace(/\D/g, '') })}
              />
              <select aria-label={`Unidade da faixa ${i + 1}`} className="campo !px-2" value={f.unidade} onChange={(e) => setFaixa(i, { unidade: e.target.value as FaixaTexto['unidade'] })}>
                <option value="meses">meses</option>
                <option value="dias">dias</option>
              </select>
              <input aria-label={`% do CDI da faixa ${i + 1}`} className="campo !px-2 font-mono" inputMode="decimal" value={f.percentual} onChange={(e) => setFaixa(i, { percentual: e.target.value })} />
              <button
                type="button"
                aria-label={`Remover faixa ${i + 1}`}
                disabled={i === 0}
                className="px-1.5 text-lg leading-none text-texto-2 disabled:opacity-0"
                onClick={() => set({ faixas: valor.faixas.filter((_, k) => k !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="self-start text-xs font-bold text-positivo"
            onClick={() => {
              const u = valor.faixas[valor.faixas.length - 1]
              set({ faixas: [...valor.faixas, { inicio: String((Number(u?.inicio) || 0) + 6), unidade: u?.unidade ?? 'meses', percentual: '' }] })
            }}
          >
            + Adicionar faixa
          </button>
          <label className="flex items-start gap-2.5 text-[13px]">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--positivo)]" checked={valor.retroativa} onChange={(e) => set({ retroativa: e.target.checked })} />
            <span>
              <b>Retroativa</b>
              <span className="block text-xs text-texto-2">
                Ao mudar de faixa, a nova taxa vale desde a data da aplicação (recalcula todo o rendimento). Desmarcado: cada dia rende com a taxa da faixa daquele dia.
              </span>
            </span>
          </label>
          <Campo id={`${id}-cont`} rotulo="Contagem do prazo">
            <select id={`${id}-cont`} className="campo" value={valor.contagem} onChange={(e) => set({ contagem: e.target.value as EstadoRentabilidade['contagem'] })}>
              <option value="individual">Individual: cada aporte conta o próprio prazo</option>
              <option value="compartilhada">Compartilhada: desde o 1º aporte</option>
            </select>
          </Campo>
        </div>
      )}

      <Campo id={`${id}-car`} rotulo="Carência (dias corridos, opcional)">
        <input
          id={`${id}-car`}
          className="campo font-mono"
          inputMode="numeric"
          placeholder="ex.: 30 = resgate a partir do 31º dia"
          value={valor.carencia}
          onChange={(e) => set({ carencia: e.target.value.replace(/\D/g, '') })}
        />
      </Campo>
    </>
  )
}

// ============ Detalhe do ativo: situação das aplicações progressivas ============

/** Faixa vigente de uma aplicação progressiva: % atual, desde quando e a próxima mudança. */
export function faixaDoLote(l: Lote, hoje: string): { indice: number; total: number; atual: number; desde: string; proxima: ReturnType<typeof proximaFaixa> } | null {
  const e = l.progressiva
  if (!e) return null
  const k = faixaEm(e.cfg, e.inicioContagem, hoje)
  return {
    indice: k,
    total: e.cfg.faixas.length,
    atual: e.cfg.faixas[k].percentual,
    desde: inicioDaFaixa(e.inicioContagem, e.cfg.faixas[k]),
    proxima: proximaFaixa(e.cfg, e.inicioContagem, hoje),
  }
}

export function emCarencia(l: Pick<Lote, 'disponivelEm'>, hoje: string): boolean {
  return !!l.disponivelEm && hoje < l.disponivelEm
}

const HORIZONTES = [
  { meses: 6, nome: '6 meses' },
  { meses: 12, nome: '1 ano' },
  { meses: 24, nome: '2 anos' },
  { meses: 36, nome: '3 anos' },
]

/**
 * Cartão da rentabilidade progressiva: % vigente de cada aplicação, disponível × em carência,
 * retorno líquido consolidado e uma PROJEÇÃO com CDI hipotético (separada do realizado).
 */
export function CartaoProgressiva({ lotes, cfg, hoje, cdiUltimo, isenta }: { lotes: Lote[]; cfg: ConfigProgressiva; hoje: string; cdiUltimo: number | null; isenta: boolean }) {
  const ativos = lotes.filter((l) => l.saldo > 0.005)
  const cdiAnualAtual = cdiUltimo != null ? ((1 + cdiUltimo / 100) ** 252 - 1) * 100 : 14.9
  const [cdiAnual, setCdiAnual] = useState(cdiAnualAtual.toFixed(2).replace('.', ','))
  const [horizonte, setHorizonte] = useState(12)

  let disponivel = 0
  let carencia = 0
  let aplicado = 0
  let bruto = 0
  let liquido = 0
  for (const l of ativos) {
    const tr = tributacaoDoLote(l, hoje, isenta)
    if (emCarencia(l, hoje)) carencia += l.saldo
    else disponivel += l.saldo
    aplicado += l.custo
    bruto += l.saldo
    liquido += tr.liquido
  }

  const a = lerNumero(cdiAnual)
  const cdiDia = a > 0 ? ((1 + a / 100) ** (1 / 252) - 1) * 100 : null
  const ate = somarMeses(hoje, horizonte)
  let projBruto = 0
  let projLiquido = 0
  if (cdiDia != null) {
    for (const l of ativos) {
      const s = projetarSaldo(l, ate, cdiDia)
      projBruto += s
      projLiquido += tributacaoDoLote({ ...l, saldo: s }, ate, isenta).liquido
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-texto-2">
        {descreverFaixas(cfg)}
        {' · '}
        {cfg.retroativa ? 'retroativa' : 'não retroativa'} · {cfg.contagem === 'individual' ? 'prazo por aplicação' : 'prazo desde o 1º aporte'}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Linha rotulo="Disponível para resgate" valor={formatarBRL(disponivel)} />
        <Linha rotulo="Em carência" valor={formatarBRL(carencia)} cor={carencia > 0.005 ? 'text-reservado-texto' : ''} />
        <Linha rotulo="Rendimento bruto" valor={formatarBRLComSinal(bruto - aplicado)} cor={corSinal(bruto - aplicado)} />
        <Linha
          rotulo="Retorno líquido (estim.)"
          valor={`${formatarBRLComSinal(liquido - aplicado)}${aplicado > 0 ? ` (${formatarPercentual((liquido - aplicado) / aplicado)})` : ''}`}
          cor={corSinal(liquido - aplicado)}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-linha p-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[13px] font-bold">Projeção</div>
          <span className="rounded-full bg-segmento px-2 text-[10px] font-bold text-texto-2">PROJETADO · não realizado</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Campo id="proj-cdi" rotulo="Hipótese de CDI (% a.a.)">
            <input id="proj-cdi" className="campo !px-2 font-mono" inputMode="decimal" value={cdiAnual} onChange={(e) => setCdiAnual(e.target.value)} />
          </Campo>
          <Campo id="proj-h" rotulo="Horizonte">
            <select id="proj-h" className="campo !px-2" value={horizonte} onChange={(e) => setHorizonte(Number(e.target.value))}>
              {HORIZONTES.map((h) => (
                <option key={h.meses} value={h.meses}>{h.nome}</option>
              ))}
            </select>
          </Campo>
        </div>
        {cdiDia == null ? (
          <div className="text-xs text-negativo">Informe uma hipótese de CDI.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Linha rotulo={`Saldo bruto em ${formatarData(ate)}`} valor={formatarBRL(projBruto)} />
            <Linha rotulo="Líquido projetado" valor={formatarBRL(projLiquido)} />
          </div>
        )}
        <div className="text-[11px] text-texto-2">
          Supõe o CDI constante e sem novos aportes ou resgates; considera as mudanças de faixa no período. O saldo acima (realizado) usa o CDI efetivo.
        </div>
      </div>
    </div>
  )
}

function Linha({ rotulo, valor, cor = '' }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-texto-2">{rotulo}</div>
      <div className={`font-mono ${cor}`}>{valor}</div>
    </div>
  )
}

