import "dotenv/config";
import { startServer } from "./src/server.js";

const port = parseInt(process.env.PORT ?? "3001", 10);

startServer(port);
