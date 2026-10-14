import { Link } from 'react-router-dom'
import { carregarCarteira } from '../lib/dados'
import { resumir } from '../lib/calculos'
import { formatarBRL, formatarBRLComSinal, formatarBRLInteiro, formatarMesAno, formatarPercentual, hojeSP } from '../lib/formato'
import { useCarregar } from '../lib/useCarregar'
import { useAuth } from '../auth/AuthProvider'
import { BotaoTema } from '../components/BotaoTema'
import { Cartao, Carregando, Erro, Titulo } from '../components/ui'

export default function Inicio() {
  const { sair } = useAuth()
  const { dados, erro, carregando, recarregar } = useCarregar(carregarCarteira)
  const hoje = hojeSP()

  const cabecalho = (
    <Titulo
      direita={
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-texto-2">{formatarMesAno(hoje)}</span>
          <BotaoTema />
          <button type="button" onClick={sair} className="text-[13px] text-texto-2 underline-offset-2 hover:underline">
            Sair
          </button>
        </div>
      }
    >
      Início
    </Titulo>
  )

  if (carregando && !dados) return <>{cabecalho}<Carregando /></>
  if (erro) return <>{cabecalho}<Erro mensagem={erro} tentar={recarregar} /></>

  const ativos = dados ?? []
  const r = resumir(ativos.map((a) => a.posicao))
  const mes = hoje.slice(0, 7)
  const proventosMes = ativos
    .flatMap((a) => a.movimentacoes)
    .filter((m) => (m.tipo === 'dividendo' || m.tipo === 'jcp') && m.data.startsWith(mes))
    .reduce((s, m) => s + m.valor_total, 0)
  const semCotacao = ativos.filter((a) => a.posicao.semCotacao && a.posicao.quantidade > 0)

  return (
    <>
      {cabecalho}

      <div className="flex flex-col gap-1.5 rounded-2xl border border-destaque-borda bg-destaque p-5 text-white">
        <div className="text-[13px] text-destaque-texto-2">Patrimônio total</div>
        <div className="font-mono text-[30px] font-medium">{formatarBRL(r.patrimonio)}</div>
        <div className={`text-[13px] ${r.variacao < -0.005 ? 'text-destaque-negativo' : 'text-destaque-positivo'}`}>
          {formatarBRLComSinal(r.variacao)} ({formatarPercentual(r.variacaoPercentual)}) desde o início
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Cartao className="!p-3.5">
          <div className="text-xs text-texto-2">Investido</div>
          <div className="mt-1 font-mono text-[17px]">{formatarBRLInteiro(r.investido)}</div>
        </Cartao>
        <Cartao className="!p-3.5">
          <div className="text-xs text-texto-2">Proventos no mês</div>
          <div className="mt-1 font-mono text-[17px] text-positivo">{formatarBRL(proventosMes)}</div>
          <div className="mt-0.5 text-[11px] text-texto-2">Recebidos · previsão na Fase 4</div>
        </Cartao>
      </div>

      {semCotacao.length > 0 && (
        <Cartao className="text-[13px]">
          <span className="font-bold text-reservado-texto">Sem cotação: </span>
          {semCotacao.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ', '}
              <Link to={`/ativo/${a.id}`} className="text-positivo">{a.ticker}</Link>
            </span>
          ))}
          <span className="text-texto-2"> — valor calculado pelo custo até você informar a cotação.</span>
        </Cartao>
      )}

      <Cartao className="flex flex-col gap-2.5">
        <div className="text-sm font-bold">Livre × Reservado</div>
        <div className="flex h-3 overflow-hidden rounded-md bg-linha">
          <div className="bg-positivo" style={{ width: r.patrimonio > 0 ? '100%' : '0%' }} />
        </div>
        <div className="flex justify-between text-[13px]">
          <div><span className="font-bold text-positivo">Livre</span> {formatarBRLInteiro(r.patrimonio)}</div>
          <div><span className="font-bold text-reservado-texto">Reservado</span> {formatarBRLInteiro(0)}</div>
        </div>
      </Cartao>

      <Cartao className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">Objetivos</div>
          <Link to="/objetivos" className="text-[13px] text-positivo">Ver todos</Link>
        </div>
        <div className="text-[13px] text-texto-2">Reservas para objetivos chegam na Fase 2.</div>
      </Cartao>

      {ativos.length === 0 && (
        <Cartao className="flex flex-col gap-3">
          <div className="text-sm">Sua carteira está vazia. Comece cadastrando um ativo.</div>
          <Link to="/ativos/novo" className="self-start rounded-xl bg-botao px-4 py-3 text-sm font-bold text-white">
            Cadastrar ativo
          </Link>
        </Cartao>
      )}
    </>
  )
}
