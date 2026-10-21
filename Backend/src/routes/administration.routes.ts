import { Router } from "express";
import * as controller from "../controllers/administration.controller.js";
const router = Router();
router.get("/audit", controller.getaudit);
router.get("/admin/members", controller.getadminMembers);
router.patch("/admin/members/:id", controller.patchadminMembersId);
router.get("/auth/profile", controller.getauthProfile);
router.get("/reports", controller.getreports);
export default router;
