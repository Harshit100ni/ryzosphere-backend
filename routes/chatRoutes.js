const express = require("express");
const DynamicQueryProcessor = require("../dynamicQueryProcessor.js");
const router = express.Router();
require("dotenv").config();

const queryProcessor = new DynamicQueryProcessor(
  process.env.NEO4J_URI,
  process.env.NEO4J_USER,
  process.env.NEO4J_PASSWORD,
  process.env.OPENAI_API_KEY
);

queryProcessor.initialize().then(() => {
  console.log("Query processor initialized with schema information");
});

// Chat API route
router.post("/", async (req, res) => {
  const { query } = req.body;

  try {
    const result = await queryProcessor.processNaturalLanguageQuery(query);
    res.json(result);
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({
      response:
        "Sorry, I encountered an error. Please try asking your question again.",
      success: false,
    });
  }
});

module.exports = router;
