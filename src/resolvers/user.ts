import { User } from "../entities/User";
import { MyContext } from "../types";
import {
    Arg,
    Ctx,
    Field,
    Mutation,
    ObjectType,
    Query,
    Resolver,
} from "type-graphql";
import argon2 from "argon2";
import { EntityManager } from "@mikro-orm/knex";
import { validateRegister } from "../utils/validateRegister";
import { UsernamePasswordInput } from "./UsernamePasswordInput";

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

@Resolver()
export class UserResolver {
    @Mutation(() => Boolean)
    async forgotPassword() // @Ctx() { em }: MyContext // @Arg("email") email: string,
    {
        // const user = await em.findOne(User, { email });
        return true;
    }

    @Query(() => User, { nullable: true })
    async me(@Ctx() { req, em }: MyContext) {
        // you are not logged in
        if (!req.session.userId) {
            return null;
        }

        const user = em.findOne(User, { id: req.session.userId });
        return user;
    }

    @Mutation(() => UserResponse)
    async register(
        @Arg("options") options: UsernamePasswordInput,
        @Ctx() { em, req }: MyContext
    ): Promise<UserResponse> {
        const errors = validateRegister(options);
        if (errors) {
            return { errors };
        }

        const userExists = await em.findOne(User, {
            username: options.username,
        });
        if (userExists) {
            return {
                errors: [
                    {
                        field: "user exists",
                        message: "user already exists",
                    },
                ],
            };
        }
        const hashedPassword = await argon2.hash(options.password);
        let user;
        try {
            const result = await (em as EntityManager)
                .createQueryBuilder(User)
                .getKnexQuery()
                .insert({
                    username: options.username,
                    password: hashedPassword,
                    email: options.email,
                    created_at: new Date(),
                    updated_at: new Date(),
                })
                .returning("*");
            console.log("RESULT", result);
            user = result[0];
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
        @Arg("usernameOrEmail") usernameOrEmail: string,
        @Arg("password") password: string,
        @Ctx() { em, req }: MyContext
    ): Promise<UserResponse> {
        const user = await em.findOne(
            User,
            usernameOrEmail.includes("@")
                ? { email: usernameOrEmail }
                : { username: usernameOrEmail }
        );
        if (!user) {
            return {
                errors: [
                    {
                        field: "usernameOrEmail",
                        message: "that username doesn't exist",
                    },
                ],
            };
        }
        const valid = await argon2.verify(user.password, password);
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

        req.session.userId = user.id;

        return { user };
    }

    @Mutation(() => Boolean)
    logout(@Ctx() { req, res }: MyContext) {
        return new Promise((resolve) =>
            req.session.destroy((err) => {
                res.clearCookie("qid");

                if (err) {
                    console.log(err);
                    resolve(false);
                    return;
                }

                resolve(true);
            })
        );
    }
}
