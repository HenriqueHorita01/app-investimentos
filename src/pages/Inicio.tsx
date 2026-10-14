import { Link } from 'react-router-dom'
import { carregarCarteira } from '../lib/dados'
import { resumir } from '../lib/calculos'
import { formatarBRL, formatarBRLComSinal, formatarBRLInteiro, formatarMesAno, formatarPercentual, hojeSP } from '../lib/formato'
import { useCarregar } from '../lib/useCarregar'
import { corObjetivo } from '../lib/objetivos'
import { useAuth } from '../auth/AuthProvider'
import { BotaoTema } from '../components/BotaoTema'
import { Cartao, Carregando, corSinal, Erro, Titulo } from '../components/ui'

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
  if (erro || !dados) return <>{cabecalho}<Erro mensagem={erro ?? 'Erro ao carregar.'} tentar={recarregar} /></>

  const { ativos, progresso } = dados
  const r = resumir(ativos)
  const mes = hoje.slice(0, 7)
  const proventosMes = ativos
    .flatMap((a) => a.movimentacoes)
    .filter((m) => (m.tipo === 'dividendo' || m.tipo === 'jcp') && m.data.startsWith(mes))
    .reduce((s, m) => s + m.valor_total, 0)
  const semCotacao = ativos.filter((a) => a.posicao.semCotacao && a.posicao.quantidade > 0)
  const totalInvestimentos = r.patrimonio + r.reservado
  const pctLivre = totalInvestimentos > 0 ? (r.patrimonio / totalInvestimentos) * 100 : 0
  const rendimentoReserva = r.reservaEmergencia - r.reservaInvestido
  const objetivosAbertos = progresso.filter((p) => !p.objetivo.concluido)

  return (
    <>
      {cabecalho}

      <div className="flex flex-col gap-1.5 rounded-2xl border border-destaque-borda bg-destaque p-5 text-white">
        <div className="text-[13px] text-destaque-texto-2">Patrimônio livre</div>
        <div className="font-mono text-[30px] font-medium">{formatarBRL(r.patrimonio)}</div>
        <div className={`text-[13px] ${r.variacao < -0.005 ? 'text-destaque-negativo' : 'text-destaque-positivo'}`}>
          {formatarBRLComSinal(r.variacao)} ({formatarPercentual(r.variacaoPercentual)}) desde o início
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Cartao className="!p-3.5">
          <div className="text-xs text-texto-2">Investido (livre)</div>
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
          <div className="bg-positivo" style={{ width: `${pctLivre}%` }} />
          <div className="bg-reservado" style={{ width: `${totalInvestimentos > 0 ? 100 - pctLivre : 0}%` }} />
        </div>
        <div className="flex justify-between text-[13px]">
          <div><span className="font-bold text-positivo">Livre</span> {formatarBRLInteiro(r.patrimonio)}</div>
          <div><span className="font-bold text-reservado-texto">Reservado</span> {formatarBRLInteiro(r.reservado)}</div>
        </div>
        {r.reservado > 0 && <div className="text-xs text-texto-2">O reservado para objetivos é investimento, mas não entra no patrimônio livre.</div>}
      </Cartao>

      <Cartao className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">Objetivos</div>
          <Link to="/objetivos" className="text-[13px] text-positivo">{objetivosAbertos.length ? 'Ver todos' : 'Criar objetivo'}</Link>
        </div>
        {objetivosAbertos.length === 0 && <div className="text-[13px] text-texto-2">Nenhum objetivo ainda.</div>}
        {objetivosAbertos.slice(0, 3).map((p) => (
          <div key={p.objetivo.id} className="flex flex-col gap-1">
            <div className="flex justify-between text-[13px]">
              <div>{p.objetivo.nome}</div>
              <div className="text-texto-2">{Math.round(p.progresso * 100)}%</div>
            </div>
            <div className="h-1.5 rounded-sm bg-linha">
              <div className="h-1.5 rounded-sm" style={{ width: `${Math.min(100, p.progresso * 100)}%`, background: corObjetivo(p.objetivo) }} />
            </div>
          </div>
        ))}
      </Cartao>

      <Link to="/reserva">
        <Cartao className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">Reserva de emergência ›</div>
            <div className="text-xs text-texto-2">Fora do patrimônio</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[15px]">{formatarBRL(r.reservaEmergencia)}</div>
            {r.reservaInvestido > 0 && (
              <div className={`text-xs ${corSinal(rendimentoReserva)}`}>{formatarBRLComSinal(rendimentoReserva)} rendimento bruto</div>
            )}
          </div>
        </Cartao>
      </Link>

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
