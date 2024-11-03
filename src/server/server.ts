import { Elysia } from "elysia"

export class Server {
    private app: Elysia;

    constructor() {
        this.app = new Elysia();
    }

    start() {
        this.app.listen(process.env.PORT || 3000, () => console.log(`Server started on port ${process.env.PORT || 3000}`));
    }
}