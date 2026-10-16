import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { moverEntreDestinos, type Carteira } from '../lib/dados'
import { LIVRE } from '../lib/calculos'
import { partesDoAtivo } from '../lib/objetivos'
import { formatarBRL, lerNumero } from '../lib/formato'
import { rotuloAtivo } from '../lib/tipos'
import { Campo } from './ui'

/**
 * Separa parte de um investimento para um destino (reserva de emergência ou objetivo).
 * O dinheiro pode sair da parte Investido ou de outro destino do mesmo investimento.
 * Pode vir com o ativo fixo (detalhe do ativo) ou com o destino fixo (Objetivos / Reserva).
 */
export function ReservarParte({
  carteira,
  ativoFixo,
  objetivoFixo,
  origemFixa,
  aoSalvar,
  aoCancelar,
}: {
  carteira: Carteira
  ativoFixo?: string
  objetivoFixo?: string
  /** Parte de onde o dinheiro sai (LIVRE ou id do destino); esconde o campo "Tirar de". */
  origemFixa?: string
  aoSalvar: () => void
  aoCancelar: () => void
}) {
  const ativos = carteira.ativos.filter((a) => a.posicao.valorAtual > 0.005)
  // Reserva de emergência primeiro, depois os objetivos em aberto.
  const destinos = [carteira.progressoReserva, ...carteira.progresso.filter((p) => !p.objetivo.concluido)]
  const nomeDestino = (id: string) =>
    id === LIVRE ? 'Investido' : id === carteira.reserva.id ? 'Reserva de emergência' : (destinos.find((d) => d.objetivo.id === id)?.objetivo.nome ?? '')
  // "Investido" também é destino quando o dinheiro sai de um objetivo/reserva.
  const opcoesPara = [...destinos.map((d) => d.objetivo.id), ...(origemFixa && origemFixa !== LIVRE ? [LIVRE] : [])].filter((id) => id !== origemFixa)

  const [ativoId, setAtivoId] = useState(ativoFixo ?? ativos[0]?.id ?? '')
  const [destinoId, setDestinoId] = useState(objetivoFixo ?? opcoesPara[0] ?? LIVRE)
  const [origemEscolhida, setOrigemEscolhida] = useState<string>(origemFixa ?? LIVRE)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const ativo = carteira.ativos.find((a) => a.id === ativoId)
  // De onde pode sair: qualquer parte do investimento, menos o próprio destino.
  const origens = ativo ? partesDoAtivo(ativo.posicao, carteira.objetivos, carteira.reserva).filter((p) => p.chave !== destinoId) : []
  const origem = origens.find((p) => p.chave === origemEscolhida) ?? origens.find((p) => p.chave === LIVRE) ?? origens[0]
  const disponivel = origem?.valor ?? 0
  const destino = destinos.find((d) => d.objetivo.id === destinoId)
  const alvo = destino?.objetivo.valor_alvo ?? null
  const falta = destino && alvo != null ? Math.max(0, alvo - destino.valorAtual) : 0
  const v = lerNumero(valor)
  const br = (n: number) => n.toFixed(2).replace('.', ',')
  const nomeOrigem = origem ? (origem.chave === LIVRE ? 'Investido' : origem.nome) : ''

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!ativo) return setErro('Escolha o investimento.')
    if (!destino && destinoId !== LIVRE) return setErro('Escolha o destino.')
    if (!origem) return setErro('Este investimento não tem saldo para mover.')
    if (!(v > 0)) return setErro('Informe o valor.')
    if (v > disponivel + 0.005) return setErro(`Em "${nomeOrigem}" há ${formatarBRL(disponivel)} neste investimento.`)
    setSalvando(true)
    try {
      await moverEntreDestinos(
        ativo.id,
        origem.chave === LIVRE ? null : origem.chave,
        destinoId === LIVRE ? null : destinoId,
        Math.min(1, v / disponivel),
      )
      aoSalvar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setSalvando(false)
    }
  }

  if (!ativos.length) {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-fundo p-3 text-[13px]">
        <div>Nenhum investimento com saldo. Cadastre um ativo primeiro.</div>
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
        {objetivoFixo
          ? `Usar um investimento para ${nomeDestino(objetivoFixo)}`
          : origemFixa
            ? `Mover parte de "${nomeDestino(origemFixa)}"`
            : 'Separar parte deste investimento'}
      </div>
      {!ativoFixo && (
        <Campo id="rp-ativo" rotulo="Investimento">
          <select id="rp-ativo" className="campo" value={ativoId} onChange={(e) => { setAtivoId(e.target.value); setOrigemEscolhida(LIVRE) }}>
            {ativos.map((a) => {
              const livre = a.posicao.porDestino[LIVRE]?.valorAtual ?? 0
              return (
                <option key={a.id} value={a.id}>
                  {rotuloAtivo(a)} — {formatarBRL(a.posicao.valorAtual)}{livre >= 0.01 ? ` (investido ${formatarBRL(livre)})` : ''}
                </option>
              )
            })}
          </select>
        </Campo>
      )}
      {!objetivoFixo && (
        <Campo id="rp-obj" rotulo="Para">
          <select id="rp-obj" className="campo" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            {opcoesPara.map((id) => (
              <option key={id} value={id}>{nomeDestino(id)}</option>
            ))}
          </select>
        </Campo>
      )}
      {!objetivoFixo && destinos.length === 1 && (
        <div className="text-xs text-texto-2">
          Para separar para um objetivo, <Link to="/objetivos?novo=1" className="font-bold text-positivo">crie um objetivo</Link> primeiro.
        </div>
      )}
      {origemFixa ? (
        <div className="text-xs text-texto-2">Em "{nomeDestino(origemFixa)}" há {formatarBRL(disponivel)} neste investimento.</div>
      ) : origens.length > 0 ? (
        <Campo id="rp-origem" rotulo="Tirar de">
          <select id="rp-origem" className="campo" value={origem?.chave ?? ''} onChange={(e) => setOrigemEscolhida(e.target.value)}>
            {origens.map((o) => (
              <option key={o.chave} value={o.chave}>
                {o.chave === LIVRE ? 'Investido' : o.nome} — {formatarBRL(o.valor)}
              </option>
            ))}
          </select>
        </Campo>
      ) : (
        <div className="text-xs text-texto-2">Este investimento já está todo neste destino.</div>
      )}
      <Campo id="rp-valor" rotulo="Valor">
        <input id="rp-valor" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Campo>
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        {falta > 0.005 && falta <= disponivel + 0.005 && (
          <button type="button" onClick={() => setValor(br(falta))} className="rounded-lg border border-campo px-2.5 py-1.5">
            Completar a meta ({formatarBRL(falta)})
          </button>
        )}
        {disponivel > 0 && (
          <button type="button" onClick={() => setValor(br(disponivel))} className="rounded-lg border border-campo px-2.5 py-1.5">
            Usar tudo de {nomeOrigem} ({formatarBRL(disponivel)})
          </button>
        )}
      </div>
      {origem && (
        <div className="text-xs text-texto-2">
          {v > 0 && v <= disponivel + 0.005
            ? `Depois ficam ${formatarBRL(Math.max(0, disponivel - v))} em "${nomeOrigem}" neste investimento`
            : `Disponível em "${nomeOrigem}": ${formatarBRL(disponivel)}`}
          {destino && alvo != null ? ` · ${nomeDestino(destino.objetivo.id)}: ${formatarBRL(destino.valorAtual)} de ${formatarBRL(alvo)}` : ''}
        </div>
      )}
      <div className="text-xs text-texto-2">A parte movida continua rendendo, e o rendimento dela fica com o novo destino.</div>
      {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
      <div className="flex gap-2">
        <button type="submit" disabled={salvando || !origem} className="flex-1 rounded-xl bg-botao p-3 text-sm font-bold text-white disabled:opacity-60">
          {salvando ? 'Movendo…' : 'Mover'}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-xl border border-campo px-4 text-sm">
          Cancelar
        </button>
      </div>
    </form>
  )
}
