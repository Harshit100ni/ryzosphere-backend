const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const driver = getDriver();
    const session = driver.session();
    await session.run("RETURN 1"); //
    await session.close();

    res
      .status(200)
      .json({ status: "UP", message: "Server and database are healthy!" });
  } catch (error) {
    res
      .status(500)
      .json({ status: "DOWN", message: "Database connection failed!" });
  }
});

module.exports = router;
