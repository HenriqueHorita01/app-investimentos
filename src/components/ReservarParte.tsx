import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { reservarParteParaObjetivo, type AtivoComPosicao } from '../lib/dados'
import { LIVRE, type ProgressoObjetivo } from '../lib/calculos'
import { formatarBRL, lerNumero } from '../lib/formato'
import { rotuloAtivo } from '../lib/tipos'
import { Campo } from './ui'

const livreDe = (a: AtivoComPosicao) => a.posicao.porDestino[LIVRE]?.valorAtual ?? 0

/**
 * Reserva parte do saldo livre de um investimento para um objetivo.
 * Pode vir com o ativo fixo (detalhe do ativo) ou com o objetivo fixo (tela Objetivos).
 */
export function ReservarParte({
  ativos,
  objetivos,
  ativoFixo,
  objetivoFixo,
  aoSalvar,
  aoCancelar,
}: {
  ativos: AtivoComPosicao[]
  objetivos: ProgressoObjetivo[]
  ativoFixo?: string
  objetivoFixo?: string
  aoSalvar: () => void
  aoCancelar: () => void
}) {
  const disponiveis = ativos.filter((a) => a.finalidade === 'investimento' && livreDe(a) >= 0.01)
  const abertos = objetivos.filter((p) => !p.objetivo.concluido)
  const [ativoId, setAtivoId] = useState(ativoFixo ?? disponiveis[0]?.id ?? '')
  const [objetivoId, setObjetivoId] = useState(objetivoFixo ?? abertos[0]?.objetivo.id ?? '')
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const ativo = ativos.find((a) => a.id === ativoId)
  const livre = ativo ? livreDe(ativo) : 0
  const objetivo = abertos.find((p) => p.objetivo.id === objetivoId)
  const falta = objetivo ? Math.max(0, objetivo.objetivo.valor_alvo - objetivo.valorAtual) : 0
  const v = lerNumero(valor)
  const sobra = v > 0 ? livre - v : livre
  const br = (n: number) => n.toFixed(2).replace('.', ',')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!ativo) return setErro('Escolha o investimento.')
    if (!objetivo) return setErro('Escolha o objetivo.')
    if (!(v > 0)) return setErro('Informe o valor a reservar.')
    if (v > livre + 0.005) return setErro(`O livre deste investimento é ${formatarBRL(livre)}.`)
    setSalvando(true)
    try {
      await reservarParteParaObjetivo(ativo.id, objetivo.objetivo.id, Math.min(1, v / livre))
      aoSalvar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setSalvando(false)
    }
  }

  if (!disponiveis.length && !ativoFixo) {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-fundo p-3 text-[13px]">
        <div>Nenhum investimento com saldo livre para reservar.</div>
        <button type="button" onClick={aoCancelar} className="self-start font-bold text-texto-2">Fechar</button>
      </div>
    )
  }
  if (!abertos.length) {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-fundo p-3 text-[13px]">
        <div>Crie um objetivo antes de reservar.</div>
        <div className="flex gap-4 font-bold">
          <Link to="/objetivos?novo=1" className="text-positivo">Criar objetivo</Link>
          <button type="button" onClick={aoCancelar} className="text-texto-2">Fechar</button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3 rounded-xl bg-fundo p-3">
      <div className="text-[13px] font-bold">Reservar parte de um investimento</div>
      {!ativoFixo && (
        <Campo id="rp-ativo" rotulo="Investimento">
          <select id="rp-ativo" className="campo" value={ativoId} onChange={(e) => setAtivoId(e.target.value)}>
            {disponiveis.map((a) => (
              <option key={a.id} value={a.id}>
                {rotuloAtivo(a)} — livre {formatarBRL(livreDe(a))}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {!objetivoFixo && (
        <Campo id="rp-obj" rotulo="Objetivo">
          <select id="rp-obj" className="campo" value={objetivoId} onChange={(e) => setObjetivoId(e.target.value)}>
            {abertos.map((p) => (
              <option key={p.objetivo.id} value={p.objetivo.id}>{p.objetivo.nome}</option>
            ))}
          </select>
        </Campo>
      )}
      <Campo id="rp-valor" rotulo="Valor a reservar">
        <input id="rp-valor" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Campo>
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        {falta > 0.005 && falta <= livre + 0.005 && (
          <button type="button" onClick={() => setValor(br(falta))} className="rounded-lg border border-campo px-2.5 py-1.5">
            Completar objetivo ({formatarBRL(falta)})
          </button>
        )}
        {livre > 0 && (
          <button type="button" onClick={() => setValor(br(livre))} className="rounded-lg border border-campo px-2.5 py-1.5">
            Usar todo o livre ({formatarBRL(livre)})
          </button>
        )}
      </div>
      <div className="text-xs text-texto-2">
        Livre neste investimento: {formatarBRL(livre)}
        {v > 0 && v <= livre + 0.005 ? ` · depois sobram ${formatarBRL(Math.max(0, sobra))} livres` : ''}
        {objetivo ? ` · ${objetivo.objetivo.nome}: ${formatarBRL(objetivo.valorAtual)} de ${formatarBRL(objetivo.objetivo.valor_alvo)}` : ''}
      </div>
      <div className="text-xs text-texto-2">A parte reservada continua rendendo, e o rendimento dela vai para o objetivo.</div>
      {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
      <div className="flex gap-2">
        <button type="submit" disabled={salvando} className="flex-1 rounded-xl bg-botao p-3 text-sm font-bold text-white disabled:opacity-60">
          {salvando ? 'Reservando…' : 'Reservar'}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-xl border border-campo px-4 text-sm">
          Cancelar
        </button>
      </div>
    </form>
  )
}
