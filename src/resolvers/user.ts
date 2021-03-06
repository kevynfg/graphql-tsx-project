import { User } from "../entities/User";
import { MyContext } from "../types";
import {
    Arg,
    Ctx,
    Field,
    FieldResolver,
    Mutation,
    ObjectType,
    Query,
    Resolver,
    Root,
} from "type-graphql";
import argon2 from "argon2";
import { validateRegister } from "../utils/validateRegister";
import { UsernamePasswordInput } from "./UsernamePasswordInput";
import { sendEmail } from "../utils/sendEmail";
import { v4 } from "uuid";
import { FORGOT_PASSWORD_PREFIX } from "../constants";
import Redis from "ioredis";
import { getConnection } from "typeorm";
@ObjectType()
class FieldError {
    @Field()
    field: string;

    @Field()
    message: string;
}

@ObjectType()
class UserResponse {
    @Field(() => [FieldError], { nullable: true })
    errors?: FieldError[];

    @Field(() => User, { nullable: true })
    user?: User;
}

@Resolver(User)
export class UserResolver {
    @FieldResolver(() => String)
    email(@Root() user: User, @Ctx() { req }: MyContext) {
        //this is the current user and it's ok to show them their on email
        if (req.session.userId === user.id) {
            return user.email;
        }
        // current user wants to see someone elses email
        return "";
    }

    @Mutation(() => UserResponse)
    async changePassword(
        @Arg("token") token: string,
        @Arg("newPassword") newPassword: string,
        @Ctx() { redis, req }: MyContext
    ): Promise<UserResponse> {
        redis = new Redis();
        if (newPassword.length <= 2) {
            return {
                errors: [
                    {
                        field: "newPassword",
                        message: "length must be greater than 2",
                    },
                ],
            };
        }
        const key = FORGOT_PASSWORD_PREFIX + token;
        const userId = await redis.get(key);
        if (!userId) {
            return {
                errors: [
                    {
                        field: "token",
                        message: "token expired",
                    },
                ],
            };
        }
        const userIdNum = parseInt(userId);
        const user = await User.findOne(userIdNum);

        if (!user) {
            return {
                errors: [
                    {
                        field: "token",
                        message: "user no longer exists",
                    },
                ],
            };
        }

        await User.update(
            { id: userIdNum },
            { password: await argon2.hash(newPassword) }
        );

        redis.del(key);

        //log in user after change password
        req.session.userId = user.id;

        return { user };
    }

    @Mutation(() => Boolean)
    async forgotPassword(
        @Arg("email") email: string,
        @Ctx() { redis }: MyContext
    ) {
        redis = new Redis();

        //email is not primaryKey, so it must have a {where: }
        const user = await User.findOne({ where: { email } });

        if (!user) {
            // the email is not in the db
            return true;
        }

        const token = v4(); //create a token

        await redis.set(
            FORGOT_PASSWORD_PREFIX + token,
            user.id,
            "EX",
            1000 * 60 * 60 * 24 * 3
        ); // three days

        //send the email with the token so the user can change password
        await sendEmail(
            email,
            `<a href="http://localhost:3000/change-password/${token}">reset password</a>`
        );

        return true;
    }

    @Query(() => User, { nullable: true })
    me(@Ctx() { req }: MyContext) {
        // you are not logged in

        if (!req.session.userId) {
            return null;
        }
        return User.findOne(req.session.userId);
    }

    @Mutation(() => UserResponse)
    async register(
        @Arg("options") options: UsernamePasswordInput,
        @Ctx() { req }: MyContext
    ): Promise<UserResponse | undefined> {
        const errors = validateRegister(options);
        if (errors) {
            return { errors };
        }

        const hashedPassword = await argon2.hash(options.password);
        let user;
        try {
            //Outra forma de criar usu??rio
            // const result = await User.create({
            //     username: options.username,
            //     password: hashedPassword,
            //     email: options.email,
            // }).save();

            const result = await getConnection()
                .createQueryBuilder()
                .insert()
                .into(User)
                .values({
                    username: options.username,
                    password: hashedPassword,
                    email: options.email,
                })
                .returning("*")
                .execute();

            user = result.raw[0];
        } catch (err) {
            if (err.detail.includes("already exists")) {
                return {
                    errors: [
                        {
                            field: "username",
                            message: "username already taken",
                        },
                    ],
                };
            }
        }
        // store user id session
        // this will set a cookie on the user
        // keep them logged in
        req.session.userId = user.id;

        return { user };
    }

    @Mutation(() => UserResponse)
    async login(
        @Arg("username") username: string,
        @Arg("password") password: string,
        @Ctx() { req }: MyContext
    ): Promise<UserResponse> {
        // const user = await User.findOne(
        //     usernameOrEmail.includes("@")
        //         ? { where: { email: usernameOrEmail } }
        //         : { where: { username: usernameOrEmail } }
        // );
        const emailOrUsername = username.includes("@") ? "email" : "username";
        const user = await getConnection()
            .createQueryBuilder()
            .addFrom(User, "u")
            .where(`u.${emailOrUsername} = :username`, {
                username,
            })
            .execute();
        if (!user[0]) {
            return {
                errors: [
                    {
                        field: "usernameOrEmail",
                        message: "that username doesn't exist",
                    },
                ],
            };
        }
        const valid = await argon2.verify(user[0].password, password);
        if (!valid) {
            return {
                errors: [
                    {
                        field: "password",
                        message: "incorrect password",
                    },
                ],
            };
        }

        req.session.userId = user[0].id;
        return user[0];
    }

    @Mutation(() => Boolean)
    logout(@Ctx() { req, res }: MyContext) {
        return new Promise((resolve) => {
            req.session.destroy((err) => {
                res.clearCookie("qid");

                if (err) {
                    console.log(err);
                    resolve(false);
                    return;
                }

                resolve(true);
            });
        });
    }
}
