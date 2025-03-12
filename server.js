const express = require('express');
const cors = require('cors');
const neo4j = require('neo4j-driver');

const app = express();
app.use(cors());

// Connect to Neo4j
const driver = neo4j.driver(
  'bolt://54.197.126.179:7687',
  neo4j.auth.basic('neo4j', 'minimum-grip-mop') // Replace with your credentials
);


// Fetch Neo4j data and format it for the frontend
app.get('/api/graph-data', async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (n)-[r]->(m)
      RETURN n, r, m
    `);

    const nodesMap = new Map();
    const links = [];

    result.records.forEach(record => {
      const sourceNode = record.get('n');
      const targetNode = record.get('m');
      const relationship = record.get('r');

      // Add nodes to the map (to prevent duplicates)
      nodesMap.set(sourceNode.identity.toString(), {
        id: sourceNode.identity.toString(),
        name: sourceNode.properties.name || `Node ${sourceNode.identity}`,
      });
      nodesMap.set(targetNode.identity.toString(), {
        id: targetNode.identity.toString(),
        name: targetNode.properties.name || `Node ${targetNode.identity}`,
      });

      // Add links
      links.push({
        source: sourceNode.identity.toString(),
        target: targetNode.identity.toString(),
        relationship: relationship.type,
      });
    });

    res.json({ nodes: Array.from(nodesMap.values()), links });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Failed to fetch graph data' });
  } finally {
    await session.close();
  }
});

// Start the server
const PORT = 3002;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

// Ensure the Neo4j driver closes on exit
process.on('exit', async () => {
  await driver.close();
});
