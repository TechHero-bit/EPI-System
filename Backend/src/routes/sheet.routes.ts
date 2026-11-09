import { Router } from "express";
import * as controller from "../controllers/sheet.controller.js";
const router = Router();
router.post("/sheets", controller.postsheets);
router.get("/sheets/:id/pdf", controller.getsheetsIdPdf);
router.get("/sheets/:id/xlsx", controller.getsheetsIdXlsx);
router.post("/sheets/:id/signing-links", controller.postsheetsIdSigningLinks);
router.post("/sheets/:id/receipt", controller.postsheetsIdReceipt);
router.post(
  "/sheets/:id/manual-signature",
  controller.postsheetsIdManualSignature,
);
router.get("/sheets/:id", controller.getsheetsId);
router.get(
  "/sheets/:id/signature-status",
  controller.getsheetsIdSignatureStatus,
);
router.post("/sheets/:id/cancel", controller.postsheetsIdCancel);
router.post("/sheets/:id/returns", controller.postsheetsIdReturns);
router.post("/sheets/:id/attachment", controller.postsheetsIdAttachment);
router.get("/sheets/:id/attachments", controller.getsheetsIdAttachments);
export default router;
