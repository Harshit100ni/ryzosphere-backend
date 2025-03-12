// setupDatabase.js
const neo4j = require("neo4j-driver");
require("dotenv").config();

async function setupVectorIndex() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
  );

  const session = driver.session();

  try {
    // Create vector index with properly escaped name
    const result = await session.run(`
            CREATE VECTOR INDEX \`document-embeddings\` IF NOT EXISTS 
            FOR (n:Document) 
            ON (n.embedding)
            OPTIONS {
                indexConfig: {
                    \`vector.dimensions\`: 1536,
                    \`vector.similarity_function\`: 'cosine'
                }
            }
        `);

    console.log("Vector index created successfully");

    // Verify index exists
    const indexCheck = await session.run(`
            SHOW INDEXES
            WHERE name = 'document-embeddings'
        `);

    if (indexCheck.records.length > 0) {
      console.log("Index verification successful");
      console.log("Index details:", indexCheck.records[0].get("properties"));
    } else {
      console.log("Index not found after creation");
    }
  } catch (error) {
    console.error("Error creating vector index:", error);
    throw error;
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the setup
setupVectorIndex()
  .then(() => {
    console.log("Setup completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
  });
