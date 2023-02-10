import Header from '@/app/components/Header'

export default function NavLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <article className="my-8 flex w-full flex-col">{children}</article>
    </>
  )
}
