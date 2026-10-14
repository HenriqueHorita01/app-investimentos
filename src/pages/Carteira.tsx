import { useState } from 'react'
import { Link } from 'react-router-dom'
import { carregarCarteira, type AtivoComPosicao } from '../lib/dados'
import { classeDoTipo, ehRendaVariavel, NOME_CLASSE, NOME_TIPO, rotuloAtivo, type Classe } from '../lib/tipos'
import { formatarBRLInteiro, formatarCompacto, formatarNumero, formatarPercentual } from '../lib/formato'
import { useCarregar } from '../lib/useCarregar'
import { Cartao, Carregando, corSinal, Erro, Titulo } from '../components/ui'

const COR_CLASSE: Record<Classe, string> = {
  fii: 'var(--fii)',
  acao: 'var(--acao)',
  renda_fixa: 'var(--renda-fixa)',
  outro: 'var(--texto-2)',
}
const ORDEM: Classe[] = ['fii', 'acao', 'renda_fixa', 'outro']

export default function Carteira() {
  const { dados, erro, carregando, recarregar } = useCarregar(carregarCarteira)
  const [filtro, setFiltro] = useState<Classe | 'todos'>('todos')

  const cabecalho = (
    <Titulo
      direita={
        <Link to="/ativos/novo" className="rounded-full border border-campo bg-cartao px-3.5 py-2 text-[13px] font-bold">
          + Ativo
        </Link>
      }
    >
      Carteira
    </Titulo>
  )

  if (carregando && !dados) return <>{cabecalho}<Carregando /></>
  if (erro) return <>{cabecalho}<Erro mensagem={erro} tentar={recarregar} /></>

  const ativos = dados ?? []
  if (!ativos.length) {
    return (
      <>
        {cabecalho}
        <Cartao className="flex flex-col gap-3">
          <div className="text-sm">Nenhum ativo cadastrado.</div>
          <Link to="/ativos/novo" className="self-start rounded-xl bg-botao px-4 py-3 text-sm font-bold text-white">
            Cadastrar ativo
          </Link>
        </Cartao>
      </>
    )
  }

  const total = ativos.reduce((s, a) => s + a.posicao.valorAtual, 0)
  const porClasse = ORDEM.map((c) => ({
    classe: c,
    valor: ativos.filter((a) => classeDoTipo(a.tipo) === c).reduce((s, a) => s + a.posicao.valorAtual, 0),
    existe: ativos.some((a) => classeDoTipo(a.tipo) === c),
  })).filter((c) => c.existe)

  const lista = ativos
    .filter((a) => filtro === 'todos' || classeDoTipo(a.tipo) === filtro)
    .sort((a, b) => b.posicao.valorAtual - a.posicao.valorAtual)

  return (
    <>
      {cabecalho}

      <Cartao className="flex items-center gap-[18px]">
        <Rosca total={total} fatias={porClasse.map((c) => ({ valor: c.valor, cor: COR_CLASSE[c.classe], rotulo: NOME_CLASSE[c.classe] }))} />
        <div className="flex flex-col gap-2.5 text-[13px]">
          {porClasse.map((c) => (
            <div key={c.classe} className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COR_CLASSE[c.classe] }} />
              <div>
                <b>{NOME_CLASSE[c.classe]}</b> {formatarPercentual(total > 0 ? c.valor / total : 0, false)}
                <br />
                <span className="text-texto-2">{formatarBRLInteiro(c.valor)}</span>
              </div>
            </div>
          ))}
        </div>
      </Cartao>

      <div className="flex flex-wrap gap-2">
        {(['todos', ...porClasse.map((c) => c.classe)] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            aria-pressed={filtro === f}
            className={`rounded-full px-3.5 py-2.5 text-[13px] ${
              filtro === f ? 'bg-texto text-fundo' : 'border border-campo bg-cartao text-texto'
            }`}
          >
            {f === 'todos' ? 'Todos' : NOME_CLASSE[f]}
          </button>
        ))}
      </div>

      <div className="flex flex-col overflow-hidden rounded-[14px] bg-cartao">
        {lista.map((a, i) => (
          <LinhaAtivo key={a.id} a={a} ultima={i === lista.length - 1} />
        ))}
      </div>
    </>
  )
}

function LinhaAtivo({ a, ultima }: { a: AtivoComPosicao; ultima: boolean }) {
  const p = a.posicao
  const rv = ehRendaVariavel(a.tipo)
  const sub = rv
    ? `${NOME_TIPO[a.tipo]} · ${formatarNumero(p.quantidade)} ${p.quantidade === 1 ? 'cota' : 'cotas'}`
    : `Renda fixa${a.taxa ? ` · ${formatarNumero(a.taxa)}% ${a.indexador.toUpperCase()}` : ''}`
  return (
    <Link to={`/ativo/${a.id}`} className={`flex justify-between gap-3 px-4 py-3.5 ${ultima ? '' : 'border-b border-linha'}`}>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{rotuloAtivo(a)}</div>
        <div className="text-xs text-texto-2">{sub}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-sm">{formatarBRLInteiro(p.valorAtual)}</div>
        {rv && p.semCotacao ? (
          <div className="text-xs text-reservado-texto">sem cotação</div>
        ) : rv ? (
          <div className={`text-xs ${corSinal(p.variacao)}`}>{formatarPercentual(p.variacaoPercentual)}</div>
        ) : (
          <div className="text-xs text-texto-2">aplicado</div>
        )}
      </div>
    </Link>
  )
}

function Rosca({ total, fatias }: { total: number; fatias: { valor: number; cor: string; rotulo: string }[] }) {
  const r = 60
  const circ = 2 * Math.PI * r
  let acumulado = 0
  const desc = fatias.map((f) => `${f.rotulo} ${formatarPercentual(total > 0 ? f.valor / total : 0, false)}`).join(', ')
  return (
    <svg width="132" height="132" viewBox="0 0 150 150" role="img" aria-label={desc} className="shrink-0">
      <circle cx="75" cy="75" r={r} fill="none" stroke="var(--linha)" strokeWidth="22" />
      {total > 0 &&
        fatias.map((f) => {
          const tam = (f.valor / total) * circ
          const el = (
            <circle
              key={f.rotulo}
              cx="75"
              cy="75"
              r={r}
              fill="none"
              stroke={f.cor}
              strokeWidth="22"
              strokeDasharray={`${tam} ${circ}`}
              strokeDashoffset={-acumulado}
              transform="rotate(-90 75 75)"
            />
          )
          acumulado += tam
          return el
        })}
      <text x="75" y="72" textAnchor="middle" fontSize="12" fill="var(--texto-2)" fontFamily="DM Sans">Total</text>
      <text x="75" y="90" textAnchor="middle" fontSize="14" fill="var(--texto)" fontFamily="DM Mono">{formatarCompacto(total)}</text>
    </svg>
  )
}
