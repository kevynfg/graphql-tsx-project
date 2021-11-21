import { Request, Response } from "express";
import { Redis } from "ioredis";

interface IUserId {
    userId?: "" | number;
}

export type MyContext = {
    req: Request & { session: IUserId };
    res: Response;
    redis: Redis;
};
