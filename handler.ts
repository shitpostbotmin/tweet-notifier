import axios from 'axios'
import { SSMClient, PutParameterCommand, GetParameterCommand } from "@aws-sdk/client-ssm";

interface Tweet {
  id: string
  text: string
  edit_history_tweet_ids: string[]
}

type TweetSearchResponse = {
  data?: Tweet[],
  meta: {
    newest_id?: string,
    oldest_id?: string,
    result_count: number,
  }
}

export async function run() {
  const response = await getMatchingTweets();
  const tweets = response.data;

  if (!tweets) {
    console.log('no new tweets found');
    return;
  }

  for (const tweet of tweets) {
    console.log(`posting ${tweet.id} to discord`)
    await postMatchingTweetToDiscord(tweet)
  }

  if (response.meta.newest_id) {
    console.log(`updating parameter store with ${response.meta.newest_id} as the newest tweet`)
    await updateParameterStore(response.meta.newest_id)
  }
};

async function getMatchingTweets(): Promise<TweetSearchResponse> {
  const url = 'https://api.twitter.com/2/tweets/search/recent'
  const response = await axios.get(url, {
    params: {
      query: `from:${process.env.APP_ACCOUNT_ID} ${process.env.query}`,
      since_id: await getLatestIdFromParameterStore(),
    },
    headers: {
      Authorization: `Bearer ${process.env.APP_TWITTER_BEARER_TOKEN}`
    }
  })
  const data: TweetSearchResponse = response.data;
  return data;
}

async function postMatchingTweetToDiscord(tweet: Tweet) {
  if (!process.env.APP_DISCORD_WEBHOOK) {
    throw new Error('Missing APP_DISCORD_WEBHOOK')
  }

  await axios.post(process.env.APP_DISCORD_WEBHOOK, {
    content: `https://twitter.com/${process.env.APP_ACCOUNT_ID}/status/${tweet.id}`
  })
}

async function updateParameterStore(newestId: string): Promise<void> {
  const client = new SSMClient({ region: process.env.AWS_REGION });
  const command = new PutParameterCommand({
    Name: getParameterName(),
    Value: newestId,
  })
  await client.send(command);
}

async function getLatestIdFromParameterStore(): Promise<string | undefined> {
  const client = new SSMClient({ region: process.env.AWS_REGION });
  const command = new GetParameterCommand({
    Name: getParameterName(),
  })
  const response = await client.send(command);

  return response.Parameter?.Value;
}

function getParameterName() {
  return `tweet-notifier/latest-${process.env.APP_ACCOUNT_ID}-tweet`;
}