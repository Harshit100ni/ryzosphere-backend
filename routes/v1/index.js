const express = require("express");
const router = express.Router();

const signalsRoutes = require("../signals");
const suggestionsRoutes = require("../suggestions");
const ImportSheetRoutes = require("../importSheet");
const getknowledgeGraph = require("../getknowledgeGraph");
const healthCheck = require("../healthCheck");
const chatRoutes = require("../chatRoutes");
const initRoutes = require("../intilizeSheetInToNeo4j/initRoutes");
const getStates = require("../getStateList");
const getProductTags = require("../getProductTags");
const getOrgType = require("../getOrgType");
const getOrgSubType = require("../getOrgSubType");

router.use("/signals", signalsRoutes);
router.use("/suggestions", suggestionsRoutes);
router.use("/import-sheets", ImportSheetRoutes);
router.use("/get-knowledge-graph", getknowledgeGraph);
router.use("/health-check", healthCheck);
router.use("/chat", chatRoutes);
router.use("/init", initRoutes);
router.use("/state", getStates);
router.use("/product", getProductTags);
router.use("/org-type", getOrgType);
router.use("/org-sub-type", getOrgSubType);

module.exports = router;
