import { Post } from "../entities/Post";
import {
    Arg,
    Ctx,
    Field,
    FieldResolver,
    InputType,
    Int,
    Mutation,
    Query,
    Resolver,
    Root,
    UseMiddleware,
} from "type-graphql";
import { isAuth } from "../middleware/isAuth";
import { MyContext } from "../types";
import { getConnection } from "typeorm";

@InputType()
class PostInput {
    @Field()
    title: string;
    @Field()
    text: string;
}

@Resolver(Post)
export class PostResolver {
    @FieldResolver(() => String)
    textSnippet(@Root() root: Post) {
        return root.text.slice(0, 50);
    }

    @Query(() => [Post])
    posts(
        @Arg("limit", () => Int) limit: number,
        @Arg("cursor", () => String, { nullable: true }) cursor: string | null // works just like 'offset' but a little better
    ): Promise<Post[]> {
        const realLimit = Math.min(50, limit); //limit is 50 only
        const queryBuilder = getConnection()
            .getRepository(Post)
            .createQueryBuilder("p")
            .orderBy('"createdAt"', "DESC") //postgresql needs double quotes
            .take(realLimit); //pagination

        if (cursor) {
            queryBuilder.where('"createdAt" < :cursor', {
                cursor: new Date(parseInt(cursor)),
            });
        }

        return queryBuilder.getMany();
    }

    @Query(() => Post, { nullable: true })
    post(@Arg("id") id: number): Promise<Post | undefined> {
        return Post.findOne(id);
    }

    @Mutation(() => Post)
    @UseMiddleware(isAuth)
    async createPost(
        @Arg("input") input: PostInput,
        @Ctx() { req }: MyContext
    ): Promise<Post> {
        req.session.userId = 1;
        return Post.create({
            title: input.title,
            text: input.text,
            creatorId: req.session.userId,
        }).save();
    }

    @Mutation(() => Post, { nullable: true })
    async updatePost(
        @Arg("id") id: number,
        @Arg("title", () => String, { nullable: true }) title: string
    ): Promise<Post | null> {
        const post = await Post.findOne(id);
        if (!post) {
            return null;
        }
        if (typeof title !== "undefined") {
            await Post.update({ id }, { title });
        }
        return post;
    }

    @Mutation(() => Boolean)
    async deletePost(@Arg("id") id: number): Promise<boolean> {
        await Post.delete(id);
        return true;
    }
}
