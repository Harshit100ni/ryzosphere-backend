# Ryzosphere App Server

## 📌 Overview

Ryzosphere App Server is a backend application built with **Node.js** and **Express**, utilizing **Neo4j** as the graph database. It provides structured API endpoints with version control (`v1`).

## 🚀 Technologies Used

- **Node.js**
- **Express.js**
- **Neo4j Graph Database**
- **OpenAI API**
- **Google Sheets API**

## 📂 Project Setup

### 1️⃣ Prerequisites

Ensure you have the following installed on your system:

- **Node.js** (Recommended: v16 or later)
- **npm** (Comes with Node.js)
- **Neo4j Database** (Installed & Running)

### 2️⃣ Install Dependencies

Run the following command in the project root directory:

```sh
npm install
```

### 3️⃣ Environment Configuration

Create a **.env** file in the root directory and add the following variables:

```sh
OPENAI_API_KEY=<your-openai-api-key>

# Neo4j Database Configuration
NEO4J_URI=<your-neo4j-database-uri>
NEO4J_USER=<your-username>
NEO4J_PASSWORD=<your-password>
AURA_INSTANCEID=<your-aura-instance-id>
AURA_INSTANCENAME=<your-aura-instance-name>

# Server Configuration
SERVER_PORT=8080
```

⚠ **Note:** Never share your API keys or database credentials publicly.

### 4️⃣ Start the Local Server

Run the backend server using:

```sh
npm start
```

## 🔍 API Endpoints

### 1️⃣ Health Check

**Endpoint:** `GET /api/health-check`

**Response:**

```json
{
  "status": "OK",
  "message": "Server is running"
}
```

### 2️⃣ API Routes

The backend provides multiple routes for handling signals, suggestions, knowledge graph retrieval, and chat features.

| Route                      | Description                     |
| -------------------------- | ------------------------------- |
| `/api/signals`             | Handles signal-related APIs     |
| `/api/suggestions`         | Provides suggestion services    |
| `/api/import-sheets`       | Imports data from Google Sheets |
| `/api/get-knowledge-graph` | Retrieves knowledge graph data  |
| `/api/health-check`        | API health check                |
| `/api/chat`                | Manages chatbot interactions    |
| `/api/init`                | Initializes required services   |

## 📦 Dependencies

```json
"dependencies": {
    "axios": "^1.7.9",
    "cors": "^2.8.5",
    "csv-parse": "^5.6.0",
    "csv-parser": "^3.1.0",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "googleapis": "^144.0.0",
    "neo4j-driver": "^5.27.0",
    "nodemon": "^3.1.9",
    "openai": "^4.80.0"
}
```

## 🛠️ Connecting to Neo4j

Ensure that:

- Your **Neo4j database** is running and accessible.
- The **credentials** in `.env` match the database setup.

## 🎯 Version Control

- **API Version:** `v1`
- All endpoints follow versioning for structured API evolution.

---

Your backend is now set up and ready to go! 🚀
