import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

app.use("/uploads", express.static(path.resolve("public/uploads")));

app.use("/api", router);

// Serve the built React frontend in production
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.resolve("artifacts/pesamatrix/dist/public");
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }
}

export default app;
