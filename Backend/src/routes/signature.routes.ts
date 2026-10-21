import { Router } from "express";
import * as controller from "../controllers/signature.controller.js";
const router = Router();
router.get("/sign/:token", controller.getsignToken);
router.post("/sign/:token/code", controller.postsignTokenCode);
router.post("/sign/:token/preview", controller.postsignTokenPreview);
router.post("/sign/:token/confirm", controller.postsignTokenConfirm);
export default router;
