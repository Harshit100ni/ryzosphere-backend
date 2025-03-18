const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/get-org-type", async (req, res) => {
  console.log("Fetching states...");
  try {
    const driver = getDriver();
    const session = driver.session();

    const query = `MATCH (n:Organization_Type) RETURN n.NodeID AS OrgType`; // Change NodeID if needed
    const result = await session.run(query);

    // Extract state names from the query result
    const OrgTypeList = result.records.map((record) => record.get("OrgType"));

    res.json({
      success: true,
      message: OrgTypeList.length
        ? "fetched successfully."
        : "No states found.",
      data: OrgTypeList,
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
