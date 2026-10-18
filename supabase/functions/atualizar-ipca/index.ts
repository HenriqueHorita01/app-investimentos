// Edge Function: busca o IPCA mensal (variação % no mês) e grava em ipca_mensal.
// Fonte principal: BCB SGS série 433. Reserva: IBGE SIDRA (tabela 1737, variável 63),
// que é a fonte oficial do índice. Agendada via pg_cron. Idempotente: só faz upsert de
// dado público, por isso roda sem JWT (verify_jwt = false).
import { createClient } from 'jsr:@supabase/supabase-js@2'

type Registro = { mes: string; variacao: number; fonte: string }

/** Lê JSON sem quebrar quando a API devolve uma página de erro (HTML/XML). */
async function jsonOuNull(r: Response): Promise<unknown | null> {
  const texto = await r.text()
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}

async function doBcb(): Promise<Registro[] | null> {
  const hoje = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/2016&dataFinal=${hoje}`, {
    headers: { Accept: 'application/json' },
  })
  const dados = r.ok ? await jsonOuNull(r) : null
  if (!Array.isArray(dados)) return null
  // "01/09/2026" → "2026-09-01"
  return (dados as { data: string; valor: string }[]).map((l) => ({
    mes: l.data.split('/').reverse().join('-'),
    variacao: Number(l.valor),
    fonte: 'bcb_sgs_433',
  }))
}

async function doIbge(): Promise<Registro[] | null> {
  const r = await fetch('https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63/p/last%20130', { headers: { Accept: 'application/json' } })
  const dados = r.ok ? await jsonOuNull(r) : null
  if (!Array.isArray(dados) || dados.length < 2) return null
  // Primeira linha é o cabeçalho. D3C = período "202609", V = valor.
  return (dados.slice(1) as { D3C: string; V: string }[])
    .filter((l) => /^\d{6}$/.test(l.D3C) && l.V && !Number.isNaN(Number(l.V)))
    .map((l) => ({ mes: `${l.D3C.slice(0, 4)}-${l.D3C.slice(4)}-01`, variacao: Number(l.V), fonte: 'ibge_sidra_1737' }))
}

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const registros = (await doBcb().catch(() => null)) ?? (await doIbge().catch(() => null))
  if (!registros?.length) return Response.json({ erro: 'BCB e IBGE indisponíveis; tenta de novo na próxima execução' }, { status: 503 })

  const { error } = await supabase.from('ipca_mensal').upsert(registros, { onConflict: 'mes' })
  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json({ ok: true, fonte: registros[0].fonte, gravados: registros.length, ultimo: registros.at(-1) })
})
