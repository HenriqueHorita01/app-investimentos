import { Link } from 'react-router-dom'
import { carregarCarteira } from '../lib/dados'
import { formatarBRL, formatarBRLComSinal, formatarData, formatarNumero, formatarPercentual } from '../lib/formato'
import { ehRendaVariavel, NOME_TIPO, rotuloAtivo } from '../lib/tipos'
import { useCarregar } from '../lib/useCarregar'
import { Cartao, Carregando, corSinal, Erro, Titulo } from '../components/ui'

export default function Reserva() {
  const { dados, erro, carregando, recarregar } = useCarregar(carregarCarteira)

  const cabecalho = (
    <Titulo
      direita={
        <Link to="/ativos/novo?finalidade=reserva_emergencia&voltar=/reserva" className="rounded-full border border-campo bg-cartao px-3.5 py-2 text-[13px] font-bold">
          + Aplicação
        </Link>
      }
    >
      Reserva
    </Titulo>
  )

  if (carregando && !dados) return <>{cabecalho}<Carregando /></>
  if (erro || !dados) return <>{cabecalho}<Erro mensagem={erro ?? 'Erro ao carregar.'} tentar={recarregar} /></>

  const ativos = dados.ativos.filter((a) => a.finalidade === 'reserva_emergencia')
  const saldo = ativos.reduce((s, a) => s + a.posicao.valorAtual, 0)
  const aplicado = ativos.reduce((s, a) => s + a.posicao.investido, 0)
  const rendimento = saldo - aplicado
  // CDI anualizado (252 dias úteis) a partir da taxa diária mais recente.
  const cdiAno = dados.cdiUltimo != null ? (1 + dados.cdiUltimo / 100) ** 252 - 1 : null

  return (
    <>
      {cabecalho}

      <div className="flex flex-col gap-1.5 rounded-2xl border border-destaque-borda bg-destaque p-5 text-white">
        <div className="text-[13px] text-destaque-texto-2">Reserva de emergência · saldo bruto</div>
        <div className="font-mono text-[30px] font-medium">{formatarBRL(saldo)}</div>
        <div className={`text-[13px] ${rendimento < -0.005 ? 'text-destaque-negativo' : 'text-destaque-positivo'}`}>
          {formatarBRLComSinal(rendimento)} ({formatarPercentual(aplicado > 0 ? rendimento / aplicado : 0)}) de rendimento
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Cartao className="!p-3.5">
          <div className="text-xs text-texto-2">Aplicado</div>
          <div className="mt-1 font-mono text-[17px]">{formatarBRL(aplicado)}</div>
        </Cartao>
        <Cartao className="!p-3.5">
          <div className="text-xs text-texto-2">CDI atual</div>
          <div className="mt-1 font-mono text-[17px]">{cdiAno != null ? `${formatarPercentual(cdiAno, false)} a.a.` : '—'}</div>
          {dados.cdiAte && <div className="mt-0.5 text-[11px] text-texto-2">atualizado até {formatarData(dados.cdiAte)}</div>}
        </Cartao>
      </div>

      {ativos.length === 0 ? (
        <Cartao className="flex flex-col gap-3 text-sm">
          <div>
            Registre aqui o dinheiro da sua reserva de emergência (ex.: CDB de liquidez diária). Ele fica <b>fora do patrimônio</b> e serve só para
            acompanhar o rendimento.
          </div>
          <Link to="/ativos/novo?finalidade=reserva_emergencia&voltar=/reserva" className="self-start rounded-xl bg-botao px-4 py-3 text-sm font-bold text-white">
            Adicionar aplicação
          </Link>
        </Cartao>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-[14px] bg-cartao">
          {ativos.map((a, i) => {
            const p = a.posicao
            const rv = ehRendaVariavel(a.tipo)
            return (
              <Link key={a.id} to={`/ativo/${a.id}`} className={`flex justify-between gap-3 px-4 py-3.5 ${i < ativos.length - 1 ? 'border-b border-linha' : ''}`}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{rotuloAtivo(a)}</div>
                  <div className="text-xs text-texto-2">
                    {rv ? `${NOME_TIPO[a.tipo]} · ${formatarNumero(p.quantidade)} cotas` : `${a.taxa ? formatarNumero(a.taxa) + '% CDI' : NOME_TIPO[a.tipo]}`}
                    {a.instituicao ? ` · ${a.instituicao}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm">{formatarBRL(p.valorAtual)}</div>
                  <div className={`text-xs ${p.semRendimento ? 'text-texto-2' : corSinal(p.variacao)}`}>
                    {p.semRendimento ? 'sem cálculo' : formatarBRLComSinal(p.variacao)}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <div className="px-1 text-xs text-texto-2">
        Rendimento bruto, calculado dia útil a dia útil pelo CDI do Banco Central. Estimativa: o valor líquido (com IR) e o extrato do banco são a
        referência final.
      </div>
    </>
  )
}
