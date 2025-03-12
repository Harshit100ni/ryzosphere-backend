const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/", async (req, res) => {
  const query = req.query.query?.toLowerCase();

  if (!query) {
    return res.status(400).json({ message: "Query parameter is required" });
  }

  try {
    const driver = getDriver();
    const session = driver.session();

    const result = await session.run(
      `
      MATCH (entity)
      WHERE toLower(entity.NodeID) = $query  // Exact match first
      RETURN entity.NodeID AS name
      UNION
      MATCH (entity)
      WHERE toLower(entity.NodeID) STARTS WITH $query // Then find partial matches
      RETURN entity.NodeID AS name
      LIMIT 10
      `,
      { query }
    );

    const suggestions = result.records.map((record) => record.get("name"));

    return res.json({ suggestions });
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
