import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
let token = "";

export const authorizeTwitch = async () => {
  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: "https://id.twitch.tv/oauth2/token?client_id=nll66b09wopq67x02ev9n172m6u0gh&client_secret=vgabsslz61vidqd1gxpnrjvgcukf6j&grant_type=refresh_token&refresh_token=ntxh487kmxx0yd79krn60sq61hg87tstrpogp6b1uc5vw7rd6t"
  };

  const result = await axios.request(config);
  token = result.data.access_token;
};

export const getFollowerCount = async (user) => {
  let config = {
    method: "get",
    maxBodyLength: Infinity,
    url: `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.user_id}`,
    headers: {
      "Client-Id": "nll66b09wopq67x02ev9n172m6u0gh",
      Authorization: `Bearer ${token}`
    }
  };

  const followerCount = (await axios.request(config)).data.total;
  return followerCount;
};

export const getElleDolceStream = async () => {
  let config = {
    method: "get",
    maxBodyLength: Infinity,
    url: "https://api.twitch.tv/helix/streams?user_id=582952351",
    headers: {
      "Client-Id": "nll66b09wopq67x02ev9n172m6u0gh",
      Authorization: `Bearer ${token}`
    }
  };

  const streams = (await axios.request(config)).data.data;
  return streams[0];
};

export const getUser = async (userBase, mongo) => {
  const UserCollection = mongo.db("Twitch").collection("Users");

  const user = await UserCollection.findOne({ user_id: userBase.user_id });
  if (user) return user;

  return null;
};

export const getUsersInChat = async () => {
  let config = {
    method: "get",
    maxBodyLength: Infinity,
    url: "https://api.twitch.tv/helix/chat/chatters?broadcaster_id=582952351&moderator_id=582952351",
    headers: {
      "Client-Id": "nll66b09wopq67x02ev9n172m6u0gh",
      Authorization: `Bearer ${token}`
    }
  };

  const result = await axios.request(config);
  return result.data.data;
};

export const parseStream = (stream) => {
  return {
    id: stream.id,
    game_id: stream.game_id,
    game_name: stream.game_name,
    title: stream.title,
    started_at: new Date(stream.started_at),
    users_in_chat: []
  };
};

export const getOrCreateAndGetUser = async (user, stream, mongo) => {
  const UsersCollection = mongo.db("Twitch").collection("Users");
  let userObj = await getUser(user, mongo);

  if (!userObj) {
    await UsersCollection.insertOne({
      user_id: user.user_id,
      user_name: user.user_name,
      last_seen: new Date(),
      streams_watched: stream ? { [stream.id]: parseStream(stream) } : [],
      follower_count: await getFollowerCount({ user_id: user.user_id })
    });
    userObj = await getUser(user, mongo);
    console.log(`created ${user.user_login}`);
  }

  return userObj;
};

export const upsertUser = async (mongo, user, set_fields, unset_fields) => {
  const UsersCollection = mongo.db("Twitch").collection("Users");
  let userObj = await getUser(user, mongo);
  if (userObj) {
    if (set_fields) {
      await UsersCollection.updateOne({ user_id: user.user_id }, { $set: set_fields });
    }
    if (unset_fields) {
      await UsersCollection.updateOne({ user_id: user.user_id }, { $unset: unset_fields });
    }
    console.log(`updated ${user.user_name}`);
  } else {
    await createUser(user, null, mongo);
    console.log(`created ${user.user_name}`);
  }
};

export const createUser = async (user, stream, mongo) => {
  const UsersCollection = mongo.db("Twitch").collection("Users");
  await UsersCollection.insertOne({
    created_at: new Date(),
    user_id: user.user_id,
    user_name: user.user_name,
    last_seen: new Date(),
    streams_watched: stream ? { [stream.id]: parseStream(stream) } : {},
    is_sub: user.is_sub,
    is_following: user.is_following,
    followed_at: user.followed_at,
    in_discord: false,
    discord_username: null,
    follower_count: await getFollowerCount(user),
    sub_type: user.sub_type,
    subscribed_at: user.subscribed_at,
    sub_tier: user.sub_tier,
    gifter_id: user.gifter_id,
    gifter_name: user.gifter_name
  });
  const userObj = await getUser(user, mongo);
  console.log(`created ${user.user_login}`);
  return userObj;
};

export const getBots = async () => {
  try {
    const result = await axios.request({
      method: "get",
      maxBodyLength: Infinity,
      url: "https://api.twitchinsights.net/v1/bots/all"
    });
    return result.data.bots;
  } catch (error) {
    return [];
  }
};

export const banUser = async (user) => {
  let data = JSON.stringify({
    data: {
      user_id: user.user_id
    }
  });

  try {
    await axios.request({
      method: "post",
      maxBodyLength: Infinity,
      url: "https://api.twitch.tv/helix/moderation/bans?broadcaster_id=582952351&moderator_id=582952351",
      headers: {
        "Client-Id": "nll66b09wopq67x02ev9n172m6u0gh",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      data: data
    });
    console.log(`banned ${user.user_name}`);
  } catch (error) {
    if (error.response.data.message !== "The user specified in the user_id field is already banned.") {
      throw Error(error);
    }
  }
};

export const userIsBot = async (user) => {
  const bots = await getBots();
  const bot = bots.find((bot) => bot[0] === user.user_login);
  const isBot = !!bot;
  if (isBot) {
    await banUser(user);
  }
  return isBot;
};

export const getSubs = async () => {
  let subs = [];
  let data = null;
  let cursor = "";
  do {
    let config = {
      method: "get",
      maxBodyLength: Infinity,
      url: `https://api.twitch.tv/helix/subscriptions?broadcaster_id=582952351&first=100&after=${cursor}`,
      headers: {
        "Client-Id": "nll66b09wopq67x02ev9n172m6u0gh",
        Authorization: `Bearer ${token}`
      }
    };

    data = (await axios.request(config)).data;
    subs = subs.concat(data.data);
    cursor = data?.pagination?.cursor;
  } while (data.pagination?.cursor);
  return subs;
};
