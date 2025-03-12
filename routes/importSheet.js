const express = require("express");
const { getDriver } = require("../neo4jConnection");
const PublicSheetsNeo4jImporter = require("../PublicSheetsNeo4jImporter");

const router = express.Router();

const extractSpreadsheetId = (url) => {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)\/edit/);
  return match ? match[1] : null;
};
const isValidSpreadsheetUrl = (url) => {
  const regex =
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)(\/.*)?$/;
  return regex.test(url);
};

router.post("/", async (req, res) => {
  console.log("api mock");

  const driver = getDriver();
  const session = driver.session();

  await session.run(`MATCH (n) DETACH DELETE n`);

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ message: "Sheet URL is required" });
  }

  if (!isValidSpreadsheetUrl(url)) {
    return res.status(400).json({ message: "Invalid Spreadsheet URL" });
  }

  const importer = new PublicSheetsNeo4jImporter();
  try {
    const spreadsheetId = extractSpreadsheetId(url);
    console.log(spreadsheetId);

    await importer.importAllSheets(spreadsheetId);
    res.status(200).json({ message: "Import successful" });
  } catch (error) {
    console.error("Import failed:", error);
    res.status(500).json({
      success: false,
      error: "Import failed",
      message: "Please use a valid Spreadsheet URL",
    });
  } finally {
    // await importer.close();
  }
});

module.exports = router;
