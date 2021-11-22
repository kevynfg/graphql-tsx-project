import "reflect-metadata";
import express from "express";
import { COOKIE_NAME, __prod__ } from "./constants";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { PostResolver } from "./resolvers/post";
import { UserResolver } from "./resolvers/user";
import Redis from "ioredis";
import session from "express-session";
import connectRedis from "connect-redis";
import cors from "cors";
import { createConnection } from "typeorm";
import { Post } from "./entities/Post";
import { User } from "./entities/User";
import path from "path";

const main = async () => {
    const conn = await createConnection({
        type: "postgres",
        database: "jellyfish2",
        username: "postgres",
        password: "postgres",
        logging: true,
        synchronize: true,
        entities: [Post, User],
        migrations: [path.join(__dirname, "./migrations/*")],
    });
    await conn.runMigrations();

    // await Post.delete({});

    const app = express();

    const RedisStore = connectRedis(session);
    const redisClient = new Redis();

    app.use(
        cors({
            origin: "*",
            credentials: true,
            methods: ["GET", "POST", "UPDATE", "PUT", "PATCH", "DELETE"],
            allowedHeaders: ["Content-Type", "Authorization", "Accept"],
        })
    );

    app.use(
        session({
            name: COOKIE_NAME,
            store: new RedisStore({
                client: redisClient,
                disableTouch: true,
            }),
            cookie: {
                maxAge: 1000 * 60 * 60 * 24 * 365 * 10, //10 years
                httpOnly: true, //disable front-end access for cookies
                sameSite: "lax", //csrf
                secure: __prod__, //cookie only works in https
            },
            secret: "idontknowhow",
            resave: false,
            saveUninitialized: false,
        })
    );

    const apolloServer = new ApolloServer({
        schema: await buildSchema({
            resolvers: [PostResolver, UserResolver],
            validate: false,
        }),
        context: ({ req, res }) => ({
            req,
            res,
            Redis,
        }),
    });

    await apolloServer.start();
    apolloServer.applyMiddleware({
        app,
        cors: false,
    });

    app.listen(4000, () => {
        console.log("server started on localhost:4000");
    });
};

main().catch((err) => {
    console.error(err);
});
