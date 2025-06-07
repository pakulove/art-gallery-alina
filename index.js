const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

// Create Express app
const app = express();
app.use(express.json());
app.use(express.static("src"));

// Set view engine
app.set("view engine", "html");
app.engine("html", (filePath, options, callback) => {
  fs.readFile(filePath, (err, content) => {
    if (err) return callback(err);
    let rendered = content.toString();
    for (const [key, value] of Object.entries(options)) {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
    return callback(null, rendered);
  });
});

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

        // Проверяем существование таблиц
        this.db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='painting'",
          (err, row) => {
            if (err) {
              reject(err);
              return;
            }

            // Если таблица painting существует, значит все таблицы уже созданы
            if (row) {
              console.log(
                "Database tables already exist, skipping initialization"
              );
              resolve();
              return;
            }

            // Если таблиц нет, создаем их
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
          }
        );
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
    let whereClause = "";
    const values = [];

    if (Object.keys(conditions).length > 0) {
      const conditionsArray = [];

      for (const [key, value] of Object.entries(conditions)) {
        if (value) {
          if (key === "price") {
            // Handle price ranges
            const [min, max] = value.split("-");
            if (max) {
              conditionsArray.push(`price BETWEEN ? AND ?`);
              values.push(parseFloat(min), parseFloat(max));
            } else if (min === "10000+") {
              conditionsArray.push(`price >= ?`);
              values.push(10000);
            }
          } else if (key === "size") {
            // Handle size ranges
            const sizeRanges = {
              small: "width <= 60 AND height <= 40",
              medium: "width <= 100 AND height <= 70",
              large: "width <= 150 AND height <= 100",
            };
            if (sizeRanges[value]) {
              conditionsArray.push(sizeRanges[value]);
            }
          } else {
            conditionsArray.push(`${key} = ?`);
            values.push(value);
          }
        }
      }

      if (conditionsArray.length > 0) {
        whereClause = "WHERE " + conditionsArray.join(" AND ");
      }
    }

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

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/src/index.html");
});

// Initialize database
const db = new Database("database.sqlite");

// Initialize database from dump file
db.initFromDump("dump.sql")
  .then(() => {
    console.log("Database initialized successfully");
  })
  .catch((err) => {
    // Если таблицы уже существуют, это не критическая ошибка
    if (err.message.includes("already exists")) {
      console.log("Database tables already exist, continuing...");
    } else {
      console.error("Error initializing database:", err);
    }
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

// Painting routes
app.get("/api/painting", async (req, res) => {
  try {
    const paintings = await db.read("painting", req.query);
    const templatePath = path.join(
      __dirname,
      "src",
      "partials",
      "painting-card.html"
    );
    const template = fs.readFileSync(templatePath, "utf8");

    let html = "";
    for (const painting of paintings) {
      let cardHtml = template;
      for (const [key, value] of Object.entries(painting)) {
        cardHtml = cardHtml.replace(new RegExp(`{{${key}}}`, "g"), value || "");
      }
      html += cardHtml;
    }

    res.set("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("Error in /api/painting:", err);
    res.status(500).send("Error rendering template");
  }
});

// Reviews route
app.get("/api/reviews", async (req, res) => {
  try {
    const reviews = await db.read(
      "review",
      req.query,
      "review.*, users.first_name, users.last_name"
    );
    const templatePath = path.join(
      __dirname,
      "src",
      "partials",
      "review-card.html"
    );
    const template = fs.readFileSync(templatePath, "utf8");

    let html = "";
    for (const review of reviews) {
      let cardHtml = template;
      for (const [key, value] of Object.entries(review)) {
        cardHtml = cardHtml.replace(new RegExp(`{{${key}}}`, "g"), value || "");
      }
      html += cardHtml;
    }

    res.set("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("Error in /api/reviews:", err);
    res.status(500).send("Error rendering template");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
