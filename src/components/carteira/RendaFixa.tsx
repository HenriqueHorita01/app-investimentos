import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { diasCorridos, LIVRE, tributacaoDoLote, type Lote } from '../../lib/calculos'
import { formatarBRL, formatarBRLComSinal, formatarData, formatarPercentual, hojeSP } from '../../lib/formato'
import { ehRendaVariavel, NOME_TIPO, rotuloAtivo } from '../../lib/tipos'
import { descreverTaxaLote, ehIsenta, ListaAplicacoes, situacaoVencimento, totaisDosLotes } from '../Aplicacoes'
import { Cartao, corSinal } from '../ui'
import type { DadosMinhaCarteira } from '../../pages/MinhaCarteira'

const pctF = (f: number) => formatarPercentual(f, false)

/**
 * Renda fixa da Minha Carteira (parte Investido): consolidado por investimento, cada
 * aplicação individual, IR por prazo, vencimentos e o que está disponível para reinvestir.
 */
export function RendaFixa({ dados }: { dados: DadosMinhaCarteira }) {
  const [, setParams] = useSearchParams()
  const [aberto, setAberto] = useState<string | null>(null)
  const hoje = hojeSP()

  // Só aplicações da parte Investido (reserva e objetivos ficam fora da Minha Carteira).
  const investimentos = dados.carteira.ativos
    .filter((a) => !ehRendaVariavel(a.tipo))
    .map((a) => ({ a, lotes: a.posicao.lotes.filter((l) => l.destino === LIVRE) }))
    .filter((x) => x.lotes.some((l) => l.saldo > 0.005))
    .sort((x, y) => y.lotes.reduce((s, l) => s + l.saldo, 0) - x.lotes.reduce((s, l) => s + l.saldo, 0))

  const totais = investimentos.reduce(
    (t, x) => {
      const r = totaisDosLotes(x.lotes, hoje, ehIsenta(x.a.tipo))
      return { aplicado: t.aplicado + r.aplicado, bruto: t.bruto + r.bruto, impostos: t.impostos + r.impostos, liquido: t.liquido + r.liquido }
    },
    { aplicado: 0, bruto: 0, impostos: 0, liquido: 0 },
  )

  const todosLotes = investimentos.flatMap((x) => x.lotes.map((l) => ({ a: x.a, l })))
  const vencidas = todosLotes.filter((x) => situacaoVencimento(x.l, hoje) === 'vencida')
  const proximas = todosLotes
    .filter((x) => situacaoVencimento(x.l, hoje) === 'proxima')
    .sort((p, q) => (p.l.vencimento! < q.l.vencimento! ? -1 : 1))
  const disponivelReinvestir = vencidas.reduce((s, x) => s + tributacaoDoLote(x.l, hoje, ehIsenta(x.a.tipo)).liquido, 0)

  // Categorias de renda fixa: meta × hoje, para saber onde aplicar.
  const categoriasRf = dados.planejamento.categorias.filter(
    (c) => c.ativos.some((a) => !ehRendaVariavel(a.ativo.tipo)) || /cdb|lci|lca|tesouro|renda fixa/i.test(c.categoria.nome),
  )

  return (
    <>
      <Cartao className="flex flex-col gap-3">
        <div className="text-sm font-bold">Renda fixa (parte Investido)</div>
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <div className="text-xs text-texto-2">Aplicado</div>
            <div className="font-mono">{formatarBRL(totais.aplicado)}</div>
          </div>
          <div>
            <div className="text-xs text-texto-2">Saldo bruto</div>
            <div className="font-mono">{formatarBRL(totais.bruto)}</div>
            <div className={`text-[11px] ${corSinal(totais.bruto - totais.aplicado)}`}>{formatarBRLComSinal(totais.bruto - totais.aplicado)} rendimento</div>
          </div>
          <div>
            <div className="text-xs text-texto-2">IR + IOF estimados</div>
            <div className="font-mono">− {formatarBRL(totais.impostos)}</div>
          </div>
          <div>
            <div className="text-xs text-texto-2">Líquido estimado</div>
            <div className="font-mono font-bold">{formatarBRL(totais.liquido)}</div>
          </div>
        </div>
        <div className="text-[11px] text-texto-2">
          IR calculado aplicação por aplicação, pelo prazo de cada uma (LCI/LCA isentas). Estimativa: o extrato é a referência final.
        </div>
      </Cartao>

      {categoriasRf.length > 0 && (
        <Cartao className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-bold">Onde aplicar</div>
            <button type="button" className="text-[13px] font-bold text-positivo" onClick={() => setParams({ area: 'simulador' })}>
              Simular aporte
            </button>
          </div>
          {categoriasRf.map((c) => {
            const meta = c.categoria.percentual / 100
            const abaixo = c.atual < meta - 0.005
            return (
              <div key={c.categoria.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.categoria.cor ?? 'var(--texto-2)' }} />
                  <span className="truncate">{c.categoria.nome}</span>
                </span>
                <span className="shrink-0 text-xs">
                  <span className="font-mono">{pctF(c.atual)}</span>
                  <span className="text-texto-2"> de {pctF(meta)}</span>
                  {abaixo && <span className="ml-1.5 font-bold text-reservado-texto">abaixo</span>}
                </span>
              </div>
            )
          })}
          <div className="text-[11px] text-texto-2">Não precisa aplicar em todos todo mês: o simulador equilibra ao longo do tempo.</div>
        </Cartao>
      )}

      {(vencidas.length > 0 || proximas.length > 0) && (
        <Cartao className="flex flex-col gap-2.5">
          <div className="text-sm font-bold">Vencimentos</div>
          {vencidas.length > 0 && (
            <div className="rounded-lg bg-fundo p-2.5 text-[13px]">
              <b className="text-positivo">{formatarBRL(disponivelReinvestir)}</b> disponíveis para reinvestir (líquido estimado de{' '}
              {vencidas.length} aplicação(ões) vencida(s)). Registre o resgate em cada investimento.
            </div>
          )}
          {[...vencidas, ...proximas].map(({ a, l }) => (
            <LinhaVencimento key={`${l.movId}-${l.data}-${l.saldo}`} a={a} l={l} hoje={hoje} />
          ))}
        </Cartao>
      )}

      {investimentos.length === 0 && (
        <Cartao className="text-sm text-texto-2">
          Nenhuma aplicação de renda fixa na parte Investido ainda. Cadastre em Planejamento ou lance em <b className="text-texto">Lançar</b>.
        </Cartao>
      )}

      {investimentos.map(({ a, lotes }) => {
        const t = totaisDosLotes(lotes, hoje, ehIsenta(a.tipo))
        const ativas = lotes.filter((l) => l.saldo > 0.005)
        const exp = aberto === a.id
        const taxas = [...new Set(ativas.map((l) => descreverTaxaLote(l)).filter(Boolean))]
        return (
          <Cartao key={a.id} className="flex flex-col gap-2.5">
            <button type="button" onClick={() => setAberto(exp ? null : a.id)} aria-expanded={exp} className="flex items-start justify-between gap-2 text-left">
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{rotuloAtivo(a)}</span>
                <span className="block text-xs text-texto-2">
                  {NOME_TIPO[a.tipo]} · {ativas.length} aplicação(ões){taxas.length ? ` · ${taxas.join(' / ')}` : ''}
                  {a.instituicao ? ` · ${a.instituicao}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-sm">{formatarBRL(t.bruto)}</span>
                <span className="block text-[11px] text-texto-2">líq. {formatarBRL(t.liquido)}</span>
              </span>
            </button>
            {exp && (
              <>
                <ListaAplicacoes lotes={lotes} tipo={a.tipo} hoje={hoje} />
                <div className="flex gap-4 text-[13px] font-bold">
                  <Link to={`/lancar?ativo=${a.id}`} className="text-positivo">+ Nova aplicação</Link>
                  <Link to={`/ativo/${a.id}`} className="text-texto-2">Detalhe e lançamentos</Link>
                </div>
              </>
            )}
          </Cartao>
        )
      })}
    </>
  )
}

function LinhaVencimento({ a, l, hoje }: { a: { id: string; tipo: Parameters<typeof ehIsenta>[0]; ticker: string | null; nome: string }; l: Lote; hoje: string }) {
  const vencida = l.vencimento! <= hoje
  return (
    <div className="flex items-center justify-between gap-2 border-t border-linha pt-2 text-[13px]">
      <span className="min-w-0">
        <span className="block truncate font-bold">{rotuloAtivo(a)}</span>
        <span className="block text-xs text-texto-2">
          aplicada em {formatarData(l.data)} · {vencida ? `venceu em ${formatarData(l.vencimento!)}` : `vence em ${formatarData(l.vencimento!)} (${diasCorridos(hoje, l.vencimento!)} dias)`}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono">{formatarBRL(l.saldo)}</span>
        {vencida && (
          <Link to={`/lancar?ativo=${a.id}`} className="text-xs font-bold text-positivo">
            Registrar resgate
          </Link>
        )}
      </span>
    </div>
  )
}
