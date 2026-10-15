import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { reservarParteParaObjetivo, type AtivoComPosicao, type Carteira } from '../lib/dados'
import { LIVRE } from '../lib/calculos'
import { formatarBRL, lerNumero } from '../lib/formato'
import { rotuloAtivo } from '../lib/tipos'
import { Campo } from './ui'

const livreDe = (a: AtivoComPosicao) => a.posicao.porDestino[LIVRE]?.valorAtual ?? 0

/**
 * Separa parte do saldo livre de um investimento para um destino: a reserva de
 * emergência ou um objetivo. Pode vir com o ativo fixo (detalhe do ativo) ou com o
 * destino fixo (tela Objetivos / Reserva).
 */
export function ReservarParte({
  carteira,
  ativoFixo,
  objetivoFixo,
  aoSalvar,
  aoCancelar,
}: {
  carteira: Carteira
  ativoFixo?: string
  objetivoFixo?: string
  aoSalvar: () => void
  aoCancelar: () => void
}) {
  const disponiveis = carteira.ativos.filter((a) => livreDe(a) >= 0.01)
  // Reserva de emergência primeiro, depois os objetivos em aberto.
  const destinos = [carteira.progressoReserva, ...carteira.progresso.filter((p) => !p.objetivo.concluido)]
  const nomeDestino = (id: string) => (id === carteira.reserva.id ? 'Reserva de emergência' : (destinos.find((d) => d.objetivo.id === id)?.objetivo.nome ?? ''))

  const [ativoId, setAtivoId] = useState(ativoFixo ?? disponiveis[0]?.id ?? '')
  const [destinoId, setDestinoId] = useState(objetivoFixo ?? destinos[0].objetivo.id)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const ativo = carteira.ativos.find((a) => a.id === ativoId)
  const livre = ativo ? livreDe(ativo) : 0
  const destino = destinos.find((d) => d.objetivo.id === destinoId)
  const alvo = destino?.objetivo.valor_alvo ?? null
  const falta = destino && alvo != null ? Math.max(0, alvo - destino.valorAtual) : 0
  const v = lerNumero(valor)
  const br = (n: number) => n.toFixed(2).replace('.', ',')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!ativo) return setErro('Escolha o investimento.')
    if (!destino) return setErro('Escolha o destino.')
    if (!(v > 0)) return setErro('Informe o valor.')
    if (v > livre + 0.005) return setErro(`O livre deste investimento é ${formatarBRL(livre)}.`)
    setSalvando(true)
    try {
      await reservarParteParaObjetivo(ativo.id, destino.objetivo.id, Math.min(1, v / livre))
      aoSalvar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setSalvando(false)
    }
  }

  if (!disponiveis.length && !ativoFixo) {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-fundo p-3 text-[13px]">
        <div>Nenhum investimento com saldo livre. Cadastre um ativo ou libere parte de outro destino.</div>
        <div className="flex gap-4 font-bold">
          <Link to="/ativos/novo" className="text-positivo">Cadastrar ativo</Link>
          <button type="button" onClick={aoCancelar} className="text-texto-2">Fechar</button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3 rounded-xl bg-fundo p-3">
      <div className="text-[13px] font-bold">
        {objetivoFixo ? `Separar parte de um investimento para ${nomeDestino(objetivoFixo)}` : 'Separar parte deste investimento'}
      </div>
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
        <Campo id="rp-obj" rotulo="Destino">
          <select id="rp-obj" className="campo" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            {destinos.map((d) => (
              <option key={d.objetivo.id} value={d.objetivo.id}>{nomeDestino(d.objetivo.id)}</option>
            ))}
          </select>
        </Campo>
      )}
      {!objetivoFixo && destinos.length === 1 && (
        <div className="text-xs text-texto-2">
          Para separar para um objetivo, <Link to="/objetivos?novo=1" className="font-bold text-positivo">crie um objetivo</Link> primeiro.
        </div>
      )}
      <Campo id="rp-valor" rotulo="Valor">
        <input id="rp-valor" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Campo>
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        {falta > 0.005 && falta <= livre + 0.005 && (
          <button type="button" onClick={() => setValor(br(falta))} className="rounded-lg border border-campo px-2.5 py-1.5">
            Completar a meta ({formatarBRL(falta)})
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
        {v > 0 && v <= livre + 0.005 ? ` · depois sobram ${formatarBRL(Math.max(0, livre - v))} livres` : ''}
        {destino && alvo != null ? ` · ${nomeDestino(destino.objetivo.id)}: ${formatarBRL(destino.valorAtual)} de ${formatarBRL(alvo)}` : ''}
      </div>
      <div className="text-xs text-texto-2">A parte separada continua rendendo, e o rendimento dela fica com o destino.</div>
      {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
      <div className="flex gap-2">
        <button type="submit" disabled={salvando} className="flex-1 rounded-xl bg-botao p-3 text-sm font-bold text-white disabled:opacity-60">
          {salvando ? 'Separando…' : 'Separar'}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-xl border border-campo px-4 text-sm">
          Cancelar
        </button>
      </div>
    </form>
  )
}
