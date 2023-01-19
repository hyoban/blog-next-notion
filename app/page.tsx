import { Suspense } from 'react'

import ApperanceSwitch from '@/app/components/AppearanceSwitch'
import Icon from '@/app/icons/Icon'
import profilePic from '@/public/hyoban.png'

import PostList from './components/PostList'
import Image from 'next/image'

export const revalidate = 60

export default async function Home({}) {
  return (
    <main className="flex flex-col items-start mx-auto w-full max-w-[65ch] p-10">
      <header className="flex items-center gap-6">
        <div className="flex items-center space-x-4">
          <Image
            className="w-16 h-16 p-1 rounded-full ring-2 ring-gray-300 dark:ring-gray-500"
            src={profilePic}
            alt=""
          />
          <div className="font-medium dark:text-white">
            <div className="text-xl mb-1">Hyoban</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Student | Love react
            </div>
          </div>
        </div>
      </header>
      <p className="mt-8">
        My name is Stephen Zhou ( 周云亮 in Chinese ), Hyoban is my ID on the
        web. I&apos;m studying at NCUT.
      </p>
      <p className="mt-4">
        <span>Find me on </span>
        <a href="https://github.com/hyoban" target="_blank" rel="noreferrer">
          <Icon className="i-carbon-logo-github" />
        </a>
        <a
          href="https://elk.zone/mas.to/@hyoban"
          target="_blank"
          rel="noreferrer">
          <Icon className="i-mdi-mastodon" />
        </a>
      </p>
      <article className="flex flex-col w-full gap-6 my-8">
        <Suspense fallback={<div>Loading post list...</div>}>
          {/* @ts-expect-error Server Component */}
          <PostList />
        </Suspense>
      </article>
      <footer className="self-center">
        <ApperanceSwitch />
        <Icon className="i-carbon-rss" />
      </footer>
    </main>
  )
}
