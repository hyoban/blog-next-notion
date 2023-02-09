import probe from 'probe-image-size'
import Parser from 'rss-parser'

import { isFeedItemValid, joinFeedItemUrl } from '@/lib/utils'
import {
  BlockObjectResponse,
  ListBlockChildrenResponse,
  PageObjectResponse,
  QueryDatabaseResponse,
} from '@notionhq/client/build/src/api-endpoints'
import { NotionPost } from './notionType'

const notionToken = process.env.NOTION_TOKEN!
const databaseId = process.env.NOTION_DATABASE_ID!
const feedId = process.env.NOTION_FEED_ID!

const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
  Authorization: `Bearer ${notionToken}`,
}

const revalidate = 100

async function probeImageSize(
  url: string,
): Promise<{ width?: number; height?: number }> {
  try {
    const dim = await probe(url)
    return { width: dim.width, height: dim.height }
  } catch (e) {
    console.error('probeImageSize', e)
    return {
      width: undefined,
      height: undefined,
    }
  }
}

async function getPostInfo(page: PageObjectResponse): Promise<NotionPost> {
  const title = (page as any).properties.Name.title[0].plain_text as string

  const tags = (page as any).properties.Tags.multi_select.map(
    (i: any) => i.name,
  ) as string[]

  const coverUrl = (page.cover as any).external.url as string
  const { width, height } = await probeImageSize(coverUrl)

  return {
    id: page.id,
    title,
    tags,
    publishedTime: (page.properties['Published Time'] as any).date?.start,
    slug: (page.properties.Slug as any).rich_text[0].plain_text,
    cover: {
      url: coverUrl,
      width,
      height,
    },
    description: (page.properties.Description as any).rich_text[0].plain_text,
  }
}

export async function getPostList(): Promise<NotionPost[] | undefined> {
  try {
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

    if (!response.results) return

    return Promise.all(
      (response.results as PageObjectResponse[])
        .filter(
          (i) =>
            (i as any).properties['Published Time'].date &&
            (i as any).properties.Slug.rich_text.length > 0,
        )
        .map(getPostInfo),
    )
  } catch (e) {
    console.error('getPostList', e)
  }
}

export async function getSinglePostInfo(pageId: string, isSlug = false) {
  if (pageId === 'sw.js') return null

  if (isSlug) {
    const postList = await getPostList()
    const post = postList?.find((i) => i.slug === pageId)
    if (post) {
      return post
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
    }).then((i) => i.json())) as PageObjectResponse

    return await getPostInfo(page)
  } catch (e) {
    console.log('getSinglePostInfo', e)
    return null
  }
}

export type Block = {
  cur: BlockObjectResponse
  children?: Block[]
}

export async function getSinglePostContent(
  blockId: string,
  isSlug = false,
): Promise<Block[] | null> {
  if (isSlug) {
    const postList = await getPostList()
    const post = postList?.find((i) => i.slug === blockId)
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
    console.log('getSinglePostContent', e)
    return null
  }
}

export type PostContentType = NonNullable<
  Awaited<ReturnType<typeof getSinglePostContent>>
>

export type FeedItem = Parser.Item & {
  feedInfo: {
    id: string
    title: string
    url: string
    feedUrl: string
    avatar: string
  }
}

async function getDatabaseItemList(databaseId: string) {
  try {
    const response = (await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: 'POST',
        headers,
      },
    ).then((i) => i.json())) as QueryDatabaseResponse

    if (response.results) return response.results
  } catch (e) {
    console.error('getDatabaseItemList', e)
  }
}

const parser = new Parser()

async function parseRssFeed(feedUrl: string) {
  try {
    const feed = await parser.parseURL(feedUrl)
    return feed
  } catch (e) {
    console.error('parseRssFeed', feedUrl, e)
  }
}

export async function getFeedList() {
  const feedInfoListInDB = await getDatabaseItemList(feedId)
  if (!feedInfoListInDB) return

  const feedInfoList = feedInfoListInDB.map((i) => {
    const page = i as PageObjectResponse
    return {
      id: i.id,
      title: (page as any).properties.ID.title[0].plain_text,
      url: (page as any).properties.Homepage.url,
      feedUrl: (page as any).properties.RSS.url,
      avatar: (page.cover as any).external.url,
      type: (page as any).properties.Type.select.name as string,
    }
  })

  try {
    const feedList = await Promise.all(
      feedInfoList.map(async (i) => {
        const feed = await parseRssFeed(i.feedUrl)
        if (!feed) return []
        return feed.items.filter(isFeedItemValid).map((j) => {
          return {
            link: joinFeedItemUrl(feed.feedUrl ? feed.link : i.url, j.link),
            title: j.title,
            isoDate: j.isoDate,
            feedInfo: i,
          }
        })
      }),
    )

    // sort by published time
    return feedList
      .flat()
      .sort((a, b) => {
        if (a.isoDate && b.isoDate) {
          return new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime()
        }
        return 0
      })
      .slice(0, 10)
  } catch (e) {
    console.error('getFeedList', e)
  }
}

export type FeedListType = NonNullable<Awaited<ReturnType<typeof getFeedList>>>
