import Parser from 'rss-parser'

import { NotionPost } from './notionType'
import {
  BlockObjectResponse,
  GetPageResponse,
  PageObjectResponse,
  QueryDatabaseResponse,
  ListBlockChildrenResponse,
} from '@notionhq/client/build/src/api-endpoints'

const notionToken = process.env.NOTION_TOKEN!
const databaseId = process.env.NOTION_DATABASE_ID!
const feedId = process.env.NOTION_FEED_ID!

const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
  Authorization: `Bearer ${notionToken}`,
}

const revalidate = 60

export const getPostList = async (): Promise<NotionPost[]> => {
  const response = (await fetch(
    `https://api.notion.com/v1/databases/${databaseId}/query`,
    {
      method: 'POST',
      headers,
      next: {
        revalidate,
      },
    },
  ).then((i) => i.json())) as QueryDatabaseResponse

  return response.results
    .filter(
      (i) =>
        (i as any).properties['Published time'].date &&
        (i as any).properties.Slug.rich_text.length > 0,
    )
    .map((i) => {
      const page = i as PageObjectResponse
      const title = (page as any).properties.Name.title[0].plain_text
      const tags = (page as any).properties.Tags.multi_select.map(
        (i: any) => i.name,
      ) as string[]
      return {
        id: i.id,
        title,
        tags,
        publishedTime: (page.properties['Published time'] as any).date?.start,
        slug: (page.properties.Slug as any).rich_text[0].plain_text,
      }
    })
}

export const getSinglePostInfo = async (pageId: string, isSlug = false) => {
  if (pageId === 'sw.js') return null

  if (isSlug) {
    const postList = await getPostList()
    const post = postList.find((i) => i.slug === pageId)
    if (post) {
      return {
        id: post.id,
        title: post.title,
      }
    }
    return null
  }

  try {
    const page = (await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'GET',
      headers,
      next: {
        revalidate,
      },
    }).then((i) => i.json())) as GetPageResponse
    return {
      id: page.id,
      title: (page as any).properties.Name.title[0].plain_text as string,
    }
  } catch (e) {
    return null
  }
}

export type Block = {
  cur: BlockObjectResponse
  children?: Block[]
}

export const getSinglePostContent = async (
  blockId: string,
  isSlug = false,
): Promise<Block[] | null> => {
  if (isSlug) {
    const postList = await getPostList()
    const post = postList.find((i) => i.slug === blockId)
    if (post) {
      return getSinglePostContent(post.id)
    }
    return null
  }

  try {
    const blocks: Block[] = []
    let cursor
    while (true) {
      const response = (await fetch(
        `https://api.notion.com/v1/blocks/${blockId}/children` +
          (cursor ? `?start_cursor=${cursor}` : ''),
        {
          method: 'GET',
          headers,
          next: {
            revalidate,
          },
        },
      ).then((i) => i.json())) as ListBlockChildrenResponse
      const results = response.results as BlockObjectResponse[]

      const resultsWithChildren = await Promise.all(
        results.map(async (i) => {
          if (i.has_children) {
            return {
              cur: i,
              children: await getSinglePostContent(i.id),
            }
          }
          return {
            cur: i,
          }
        }),
      )
      blocks.push(...(resultsWithChildren as Block[]))
      if (!response.next_cursor) {
        break
      }
      cursor = response.next_cursor
    }
    return blocks
  } catch (e) {
    return null
  }
}

export type PostContentType = NonNullable<
  Awaited<ReturnType<typeof getSinglePostContent>>
>

export const getFeedList = async () => {
  const response = (await fetch(
    `https://api.notion.com/v1/databases/${feedId}/query`,
    {
      method: 'POST',
      headers,
    },
  ).then((i) => i.json())) as QueryDatabaseResponse

  const feedInfoList = response.results.map((i) => {
    const page = i as PageObjectResponse
    return {
      id: i.id,
      title: (page as any).properties.ID.title[0].plain_text,
      url: (page as any).properties.Homepage.url,
      feedUrl: (page as any).properties.RSS.url,
      avatar: (page.cover as any).external.url,
    }
  })

  const feedList = await Promise.all(
    feedInfoList.map(async (i) => {
      const parser = new Parser()
      const feed = await parser.parseURL(i.feedUrl)
      return feed.items.map((j) => {
        return {
          ...j,
          feedInfo: i,
        }
      })
    }),
  )

  // sort by published time
  return feedList.flat().sort((a, b) => {
    if (a.isoDate && b.isoDate) {
      return new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime()
    }
    return 0
  })
}
