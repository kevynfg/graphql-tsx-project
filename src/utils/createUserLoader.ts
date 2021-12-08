import DataLoader from "dataloader";
import { User } from "src/entities/User";

export const createUserLoader = () =>
    new DataLoader<string, User>(async (userIds) => {
        const users = await User.findByIds(userIds as string[]);
    });
