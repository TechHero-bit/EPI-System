import express from "express";
import cors from "cors";
import helmet from "helmet";
import { publicRateLimit } from "./middlewares/rate-limit.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import systemRoutes from "./routes/system.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import employeeRoutes from "./routes/employee.routes.js";
import sheetRoutes from "./routes/sheet.routes.js";
import signatureRoutes from "./routes/signature.routes.js";
import administrationRoutes from "./routes/administration.routes.js";
import listRoutes from "./routes/lists.routes.js";
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "8mb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(
  cors((req, callback) => {
    try {
      const allowed = process.env.APP_ORIGIN || "http://localhost:4200";
      callback(null, {
        origin: req.header("origin") === allowed ? allowed : false,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        allowedHeaders: ["Authorization", "Content-Type", "X-Organization-Id"],
      });
    } catch (e) {
      callback(e as Error);
    }
  }),
);

app.use(["/api/sign", "/api/verify-email"], publicRateLimit);
app.use("/api", systemRoutes);
app.use("/api", inventoryRoutes);
app.use("/api", employeeRoutes);
app.use("/api", sheetRoutes);
app.use("/api", signatureRoutes);
app.use("/api", administrationRoutes);
app.use("/api", listRoutes);
app.use((_req, res) =>
  res.status(404).json({ error: "Endpoint não encontrado." }),
);
app.use(errorHandler);
export default app;
