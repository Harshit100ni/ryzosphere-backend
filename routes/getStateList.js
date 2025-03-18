const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/get-states", async (req, res) => {
  console.log("Fetching states...");
  try {
    const driver = getDriver();
    const session = driver.session();

    const query = `MATCH (n:State) RETURN n.NodeID AS stateName`; // Change NodeID if needed
    const result = await session.run(query);

    // Extract state names from the query result
    const stateList = result.records.map((record) => record.get("stateName"));

    res.json({
      success: true,
      message: stateList.length
        ? "States fetched successfully."
        : "No states found.",
      data: stateList,
    });

    await session.close();
  } catch (error) {
    console.error("Error fetching states:", error);
    res
      .status(500)
      .json({ status: "DOWN", message: "Database connection failed!" });
  }
});

module.exports = router;
