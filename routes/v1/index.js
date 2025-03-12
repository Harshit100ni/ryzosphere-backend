const express = require("express");
const router = express.Router();

const signalsRoutes = require("../signals");
const suggestionsRoutes = require("../suggestions");
const ImportSheetRoutes = require("../importSheet");
const getknowledgeGraph = require("../getknowledgeGraph");
const healthCheck = require("../healthCheck");
const chatRoutes = require("../chatRoutes");
const initRoutes = require("../intilizeSheetInToNeo4j/initRoutes");

router.use("/signals", signalsRoutes);
router.use("/suggestions", suggestionsRoutes);
router.use("/import-sheets", ImportSheetRoutes);
router.use("/get-knowledge-graph", getknowledgeGraph);
router.use("/health-check", healthCheck);
router.use("/chat", chatRoutes);
router.use("/init", initRoutes);

module.exports = router;
