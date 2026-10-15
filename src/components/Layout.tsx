import { NavLink, Outlet } from 'react-router-dom'

const ITENS = [
  {
    para: '/',
    rotulo: 'Início',
    icone: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  },
  {
    para: '/carteira',
    rotulo: 'Carteira',
    icone: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v9l7 5" />
      </>
    ),
  },
  {
    para: '/minha-carteira',
    rotulo: 'Minha Carteira',
    icone: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
      </>
    ),
  },
  {
    para: '/objetivos',
    rotulo: 'Objetivos',
    icone: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
  },
  {
    para: '/reserva',
    rotulo: 'Reserva',
    icone: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />,
  },
  {
    para: '/lancar',
    rotulo: 'Lançar',
    icone: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
  },
]

export default function Layout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex flex-1 flex-col gap-4 px-5 pt-6 pb-28">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-borda bg-cartao pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="mx-auto grid max-w-md grid-cols-6 pt-2">
          {ITENS.map((i) => (
            <NavLink
              key={i.para}
              to={i.para}
              end={i.para === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-1.5 text-center text-[10px] leading-tight ${isActive ? 'font-bold text-positivo' : 'text-texto-2'}`
              }
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                {i.icone}
              </svg>
              {i.rotulo}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
