const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");


// Database wrapper class
class Database {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
  }

  // Initialize database from dump file
  async initFromDump(dumpPath) {
    const dump = fs.readFileSync(dumpPath, "utf8");
    const statements = dump.split(";").filter((stmt) => stmt.trim());

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run("PRAGMA foreign_keys = ON");

        statements.forEach((statement) => {
          if (statement.trim()) {
            this.db.run(statement, (err) => {
              if (err) {
                console.error("Error executing statement:", err);
                reject(err);
              }
            });
          }
        });

        resolve();
      });
    });
  }

  // CRUD operations
  async create(table, data) {
    const columns = Object.keys(data).join(", ");
    const placeholders = Object.keys(data)
      .map(() => "?")
      .join(", ");
    const values = Object.values(data);

    return new Promise((resolve, reject) => {
      const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
      this.db.run(query, values, function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async read(table, conditions = {}, columns = "*") {
    const whereClause = Object.keys(conditions).length
      ? "WHERE " +
        Object.keys(conditions)
          .map((key) => `${key} = ?`)
          .join(" AND ")
      : "";
    const values = Object.values(conditions);

    return new Promise((resolve, reject) => {
      const query = `SELECT ${columns} FROM ${table} ${whereClause}`;
      this.db.all(query, values, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async update(table, data, conditions) {
    const setClause = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(", ");
    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const values = [...Object.values(data), ...Object.values(conditions)];

    return new Promise((resolve, reject) => {
      const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
      this.db.run(query, values, function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async delete(table, conditions) {
    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const values = Object.values(conditions);

    return new Promise((resolve, reject) => {
      const query = `DELETE FROM ${table} WHERE ${whereClause}`;
      this.db.run(query, values, function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
}

// Create Express app
const app = express();
app.use(express.json());

app.use(express.static('src'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/src/index.html');
});


// Initialize database
const db = new Database("database.sqlite");

// Initialize database from dump file
db.initFromDump("dump.sql")
  .then(() => {
    console.log("Database initialized successfully");
  })
  .catch((err) => {
    console.error("Error initializing database:", err);
  });

// Example routes
app.post("/api/:table", async (req, res) => {
  try {
    const id = await db.create(req.params.table, req.body);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/:table", async (req, res) => {
  try {
    const rows = await db.read(req.params.table, req.query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/:table", async (req, res) => {
  try {
    const { id, ...data } = req.body;
    const changes = await db.update(req.params.table, data, { id });
    res.json({ changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/:table", async (req, res) => {
  try {
    const changes = await db.delete(req.params.table, req.query);
    res.json({ changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
