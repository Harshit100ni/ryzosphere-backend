const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/get-org-sub-type", async (req, res) => {
  console.log("Fetching states...");
  try {
    const driver = getDriver();
    const session = driver.session();

    const query = `MATCH (n:Organization_Sub_Type) RETURN n.NodeID AS OrgSubType`; // Change NodeID if needed
    const result = await session.run(query);

    // Extract state names from the query result
    const OrgSubTypeList = result.records.map((record) =>
      record.get("OrgSubType")
    );

    res.json({
      success: true,
      message: OrgSubTypeList.length
        ? "fetched successfully."
        : "No states found.",
      data: OrgSubTypeList,
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
