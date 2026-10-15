import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { atualizarObjetivo, carregarCarteira, criarObjetivo, excluirObjetivo, liberarDoObjetivo, type Carteira } from '../lib/dados'
import type { ProgressoObjetivo } from '../lib/calculos'
import { formatarBRL, formatarBRLComSinal, formatarBRLInteiro, formatarData, hojeSP, lerNumero } from '../lib/formato'
import { CORES_OBJETIVO, corObjetivo } from '../lib/objetivos'
import { useCarregar } from '../lib/useCarregar'
import type { Objetivo } from '../lib/tipos'
import { Campo, Cartao, Carregando, corSinal, Erro, Titulo } from '../components/ui'
import { ReservarParte } from '../components/ReservarParte'

export default function Objetivos() {
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const { dados, erro, carregando, recarregar } = useCarregar(carregarCarteira)
  const criando = params.get('novo') === '1'
  const voltar = params.get('voltar')

  const cabecalho = (
    <Titulo
      direita={
        !criando && (
          <button type="button" onClick={() => setParams({ novo: '1' })} className="rounded-full border border-campo bg-cartao px-3.5 py-2 text-[13px] font-bold">
            + Objetivo
          </button>
        )
      }
    >
      Objetivos
    </Titulo>
  )

  if (carregando && !dados) return <>{cabecalho}<Carregando /></>
  if (erro || !dados) return <>{cabecalho}<Erro mensagem={erro ?? 'Erro ao carregar.'} tentar={recarregar} /></>

  const lista = [...dados.progresso].sort((a, b) => Number(a.objetivo.concluido) - Number(b.objetivo.concluido))
  const reservado = lista.reduce((s, p) => s + p.valorAtual, 0)
  const alvo = lista.filter((p) => !p.objetivo.concluido).reduce((s, p) => s + (p.objetivo.valor_alvo ?? 0), 0)

  return (
    <>
      {cabecalho}

      {criando && (
        <FormObjetivo
          aoCancelar={() => setParams({})}
          aoSalvar={async (d) => {
            const o = await criarObjetivo(d)
            if (voltar) {
              navegar(`${voltar}${voltar.includes('?') ? '&' : '?'}objetivo=${o.id}`, { replace: true })
              return
            }
            setParams({})
            recarregar()
          }}
        />
      )}

      {lista.length > 0 && (
        <Cartao className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-texto-2">Reservado</div>
            <div className="font-mono text-[17px] text-reservado-texto">{formatarBRLInteiro(reservado)}</div>
          </div>
          <div>
            <div className="text-xs text-texto-2">Meta dos objetivos</div>
            <div className="font-mono text-[17px]">{formatarBRLInteiro(alvo)}</div>
          </div>
          <div className="col-span-2 text-xs text-texto-2">
            O dinheiro reservado continua investido e o rendimento fica no objetivo, mas não conta no patrimônio livre.
          </div>
        </Cartao>
      )}

      {lista.length === 0 && !criando && (
        <Cartao className="flex flex-col gap-3 text-sm">
          <div>
            Crie objetivos como <b>viagem</b>, <b>presente</b> ou <b>notebook novo</b>. Depois, ao lançar um aporte, escolha o objetivo: o valor fica
            reservado e sai do patrimônio livre.
          </div>
          <button type="button" onClick={() => setParams({ novo: '1' })} className="self-start rounded-xl bg-botao px-4 py-3 text-sm font-bold text-white">
            Criar objetivo
          </button>
        </Cartao>
      )}

      {lista.map((p) => (
        <CartaoObjetivo key={p.objetivo.id} p={p} carteira={dados} aoMudar={recarregar} />
      ))}
    </>
  )
}

function CartaoObjetivo({
  p,
  carteira,
  aoMudar,
}: {
  p: ProgressoObjetivo
  carteira: Carteira
  aoMudar: () => void
}) {
  const [usando, setUsando] = useState(false)
  const o = p.objetivo
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const cor = corObjetivo(o)
  const rendimento = p.valorAtual - p.investido
  const falta = (o.valor_alvo ?? 0) - p.valorAtual

  async function acao(fn: () => Promise<void>) {
    setErro(null)
    try {
      await fn()
      aoMudar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  if (editando) {
    return (
      <FormObjetivo
        inicial={o}
        aoCancelar={() => setEditando(false)}
        aoSalvar={async (d) => {
          await atualizarObjetivo(o.id, d)
          setEditando(false)
          aoMudar()
        }}
      />
    )
  }

  return (
    <Cartao className={`flex flex-col gap-3 ${o.concluido ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor }} />
            <span className="truncate text-[15px] font-bold">{o.nome}</span>
            {o.concluido && <span className="rounded bg-linha px-1.5 text-[11px] text-texto-2">concluído</span>}
          </div>
          {o.prazo && <div className="mt-0.5 text-xs text-texto-2">Prazo: {formatarData(o.prazo)}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[15px]">{formatarBRL(p.valorAtual)}</div>
          <div className="text-xs text-texto-2">de {formatarBRLInteiro((o.valor_alvo ?? 0))}</div>
        </div>
      </div>

      <div className="h-2 rounded bg-linha">
        <div className="h-2 rounded" style={{ width: `${Math.min(100, p.progresso * 100)}%`, background: cor }} />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-texto-2">{Math.round(p.progresso * 100)}% · {falta > 0 ? `faltam ${formatarBRLInteiro(falta)}` : 'meta atingida'}</span>
        {p.investido > 0 && <span className={corSinal(rendimento)}>{formatarBRLComSinal(rendimento)} rendimento</span>}
      </div>

      {p.ativos.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-linha pt-2.5">
          {p.ativos.map((u) => (
            <div key={u.ativoId} className="flex items-center justify-between gap-2 text-[13px]">
              <Link to={`/ativo/${u.ativoId}`} className="min-w-0 truncate text-positivo">{u.rotulo}</Link>
              <span className="flex shrink-0 items-center gap-3">
                <span className="font-mono">{formatarBRL(u.valorAtual)}</span>
                <button
                  type="button"
                  className="text-xs font-bold text-texto-2"
                  onClick={() => {
                    if (confirm(`Liberar ${formatarBRL(u.valorAtual)} de ${u.rotulo}? Volta a ser investimento livre.`)) acao(() => liberarDoObjetivo(u.ativoId, o.id))
                  }}
                >
                  Liberar
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[13px] text-texto-2">
          Nada reservado ainda. Use <b>Usar investimento</b> para separar parte de algo que você já tem, ou <b>+ Aporte</b> para um dinheiro novo.
        </div>
      )}

      {usando && (
        <ReservarParte
          carteira={carteira}
          objetivoFixo={o.id}
          aoCancelar={() => setUsando(false)}
          aoSalvar={() => {
            setUsando(false)
            aoMudar()
          }}
        />
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-linha pt-2.5 text-[13px] font-bold">
        {!o.concluido && !usando && (
          <button type="button" className="text-positivo" onClick={() => setUsando(true)}>Usar investimento</button>
        )}
        {!o.concluido && (
          <Link to={`/lancar?objetivo=${o.id}`} className="text-positivo">+ Aporte</Link>
        )}
        <button type="button" className="text-texto-2" onClick={() => setEditando(true)}>Editar</button>
        <button type="button" className="text-texto-2" onClick={() => acao(() => atualizarObjetivo(o.id, { concluido: !o.concluido }))}>
          {o.concluido ? 'Reabrir' : 'Marcar concluído'}
        </button>
        <button
          type="button"
          className="text-negativo"
          onClick={() => {
            const msg = p.valorAtual > 0
              ? `Desistir de "${o.nome}"? Os ${formatarBRL(p.valorAtual)} reservados voltam a ser investimento livre. Os lançamentos continuam.`
              : `Excluir o objetivo "${o.nome}"?`
            if (confirm(msg)) acao(() => excluirObjetivo(o.id))
          }}
        >
          Desistir
        </button>
      </div>
      {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
    </Cartao>
  )
}

function FormObjetivo({
  inicial,
  aoSalvar,
  aoCancelar,
}: {
  inicial?: Objetivo
  aoSalvar: (d: { nome: string; valor_alvo: number; prazo: string | null; cor: string }) => Promise<void>
  aoCancelar: () => void
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [alvo, setAlvo] = useState(inicial ? String(inicial.valor_alvo).replace('.', ',') : '')
  const [prazo, setPrazo] = useState(inicial?.prazo ?? '')
  const [cor, setCor] = useState(inicial?.cor ?? CORES_OBJETIVO[0])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const v = lerNumero(alvo)
    if (!nome.trim()) return setErro('Dê um nome ao objetivo.')
    if (!(v > 0)) return setErro('Informe o valor-alvo.')
    if (prazo && !inicial && prazo < hojeSP()) return setErro('O prazo não pode estar no passado.')
    setSalvando(true)
    try {
      await aoSalvar({ nome: nome.trim(), valor_alvo: v, prazo: prazo || null, cor })
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setSalvando(false)
    }
  }

  return (
    <Cartao>
      <form onSubmit={enviar} className="flex flex-col gap-3.5">
        <div className="text-sm font-bold">{inicial ? 'Editar objetivo' : 'Novo objetivo'}</div>
        <Campo id="obj-nome" rotulo="Nome">
          <input id="obj-nome" className="campo" placeholder="Viagem Japão" value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo id="obj-alvo" rotulo="Valor-alvo">
            <input id="obj-alvo" className="campo font-mono" inputMode="decimal" placeholder="5.000,00" value={alvo} onChange={(e) => setAlvo(e.target.value)} />
          </Campo>
          <Campo id="obj-prazo" rotulo="Prazo (opcional)">
            <input id="obj-prazo" type="date" className="campo !px-2 !text-sm" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </Campo>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="rotulo">Cor</span>
          <div className="flex gap-2">
            {CORES_OBJETIVO.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                aria-label={`Cor ${c}`}
                aria-pressed={cor === c}
                className={`h-8 w-8 rounded-full ${cor === c ? 'ring-2 ring-texto ring-offset-2 ring-offset-cartao' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
        <div className="flex gap-2">
          <button type="submit" disabled={salvando} className="flex-1 rounded-xl bg-botao p-3 text-sm font-bold text-white disabled:opacity-60">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" onClick={aoCancelar} className="rounded-xl border border-campo px-4 text-sm">
            Cancelar
          </button>
        </div>
      </form>
    </Cartao>
  )
}
