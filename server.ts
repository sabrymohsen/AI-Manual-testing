import { createServer } from "http";
import next from "next";
import { initSocket } from "./src/lib/socket-server";
import { logStorageHealth } from "./src/lib/storage-health";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });
  
  initSocket(server);

  // Surface an ephemeral or unwritable STORAGE_ROOT at boot rather than letting
  // it show up later as silently broken images.
  logStorageHealth().catch((err) => console.error("Storage health check failed:", err));

  server.listen(3000, () => {
    console.log("> Ready on http://localhost:3000");
  });
});
