const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  console.log(username);
  const selectUserQuery = `SELECT username FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  console.log(dbUser);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
      INSERT INTO 
        user (name, username, password, gender) 
      VALUES 
        (
          '${name}',
          '${username}', 
          '${hashedPassword}', 
          '${gender}'
        );`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  console.log(username);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowerIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowerIdsQuery);
  const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
    return eachUser.following_user_id;
  });

  const getTweetQuery = `select user.username, tweet.tweet, tweet.date_time as dateTime from user inner join tweet on user.user_id =  tweet.user_id where user.user_id in (${getFollowerIdsSimple}) order by tweet.date_time desc limit 4;`;
  const responseResult = await db.all(getTweetQuery);
  response.send(responseResult);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowerIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowerIdsQuery);
  const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
    return eachUser.following_user_id;
  });

  const getTweetQuery = `select name from user where user_id in (${getFollowerIdsSimple});`;
  const responseResult = await db.all(getTweetQuery);
  response.send(responseResult);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowerIdsQuery = `SELECT follower_user_id FROM follower WHERE following_user_id = ${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowerIdsQuery);
  const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
    return eachUser.follower_user_id;
  });

  const getTweetQuery = `select name from user where user_id in (${getFollowerIdsSimple});`;
  const responseResult = await db.all(getTweetQuery);
  response.send(responseResult);
});

const api6Output = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowingIdQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
  const getFollowingIdArray = await db.all(getFollowingIdQuery);
  const getFollowingId = getFollowingIdArray.map((eachFollower) => {
    return eachFollower.following_user_id;
  });
  const getTweetIdQuery = `select tweet_id from tweet where user_id in (${getFollowingId});`;
  const getTweetIdArray = await db.all(getTweetIdQuery);
  const followingTweetId = getTweetIdArray.map((eachId) => {
    return eachId.tweet_id;
  });
  if (followingTweetId.includes(parseInt(tweetId))) {
    const likes_count_query = `select count(user_id) as likes from like where tweet_id = ${tweetId};`;
    const likes_count = await db.get(likes_count_query);
    const reply_count_query = `select count(user_id) as replies from reply where tweet_id = ${tweetId};`;
    const reply_count = await db.get(reply_count_query);
    const tweet_tweetDateQuery = `select tweet, date_time from tweet where tweet_id = ${tweetId};`;
    const tweet_tweetDate = await db.get(tweet_tweetDateQuery);
    response.send(api6Output(tweet_tweetDate, likes_count, reply_count));
  } else {
    response.status(401);
    response.send("Invalid Request");
    console.log("Invalid Request");
  }
});

const convertLikes = (dbObject) => {
  return {
    likes: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const getFollowingIdQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
    const getFollowingIdArray = await db.all(getFollowingIdQuery);
    const getFollowingId = getFollowingIdArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });
    const getTweetIdQuery = `select tweet_id from tweet where user_id in (${getFollowingId});`;
    const getTweetIdArray = await db.all(getTweetIdQuery);
    const followingTweetId = getTweetIdArray.map((eachId) => {
      return eachId.tweet_id;
    });
    if (followingTweetId.includes(parseInt(tweetId))) {
      const getLiked = `select user.username as likes from user inner join like on user.user_id = like.user_id where like.tweet_id = ${tweetId};`;
      const getLikedUser = await db.all(getLiked);
      const getLikedUserName = getLikedUser.map((eachUser) => {
        return eachUser.likes;
      });
      response.send(convertLikes(getLikedUserName));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
