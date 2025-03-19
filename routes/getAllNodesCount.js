const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/", async (req, res) => {
  console.log("Fetching node type counts...");
  try {
    const driver = getDriver();
    const session = driver.session();

    const query = `
      CALL db.labels() YIELD label
      CALL apoc.cypher.run('MATCH (n:' + label + ') RETURN count(n) AS value', {}) YIELD value
      RETURN label AS node, value
      ORDER BY value DESC;
    `;

    const result = await session.run(query);
    await session.close();

    // Transform result into an array of objects
    const nodesCount = result.records.map((record) => ({
      node: record.get("node"),
      value: record.get("value").value.low, // Handle Neo4j Integer type
    }));

    res.status(200).json({ status: 200, data: nodesCount });
  } catch (error) {
    console.error("Error fetching node type counts:", error);
    res.status(500).json({ status: "DOWN", message: "Database query failed!" });
  }
});

module.exports = router;
