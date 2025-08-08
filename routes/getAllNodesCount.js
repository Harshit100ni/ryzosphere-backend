const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/", async (req, res) => {
  console.log("Fetching node counts for all labels...");

  try {
    const driver = getDriver();
    const session = driver.session();

    // Step 1: Get all labels
    const labelsResult = await session.run(`CALL db.labels()`);

    const labels = labelsResult.records.map((record) => record.get("label"));

    // Step 2: For each label, get count of nodes
    const counts = [];

    for (const label of labels) {
      const countResult = await session.run(
        `MATCH (n:\`${label}\`) RETURN count(n) AS count`
      );
      const count = countResult.records[0].get("count").toNumber();
      counts.push({ label, count });
    }

    await session.close();

    // Step 3: Send response with counts of all labels
    res.status(200).json({
      status: 200,
      data: counts,
    });
  } catch (error) {
    console.error("Error fetching counts for all labels:", error);
    res.status(500).json({
      status: "DOWN",
      message: "Database query failed!",
    });
  }
});

module.exports = router;
