const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");

// Create Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, "src")));
app.use("/static", express.static(path.join(__dirname, "src/static")));
app.use("/js", express.static(path.join(__dirname, "src/js")));

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

// Middleware для проверки авторизации
app.use(async (req, res, next) => {
  if (req.cookies.userId) {
    try {
      const users = await db.read("users", { id_u: req.cookies.userId });
      if (users.length > 0) {
        req.user = users[0];
        res.locals.user = users[0];
      }
    } catch (err) {
      res.status(500).send("Internal Server Error");
    }
  }
  next();
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

  async read(table, conditions = {}, columns = "*", join = "") {
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
      const query = `SELECT ${columns} FROM ${table} ${join} ${whereClause}`;
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

// Routes for HTML files
app.get("/", (req, res) => {
  console.log("GET / - Serving index.html");
  res.sendFile(path.join(__dirname, "src", "index.html"));
});

app.get("/partials/header.html", (req, res) => {
  console.log("GET /partials/header.html - Serving header partial");
  res.sendFile(path.join(__dirname, "src", "partials", "header.html"));
});

app.get("/catalog", (req, res) => {
  console.log("GET /catalog - Serving catalog.html");
  res.sendFile(path.join(__dirname, "src", "catalog.html"));
});

app.get("/auth", (req, res) => {
  console.log("GET /auth - Serving auth.html");
  res.sendFile(path.join(__dirname, "src", "auth.html"));
});

app.get("/profile", (req, res) => {
  console.log("GET /profile - Checking auth");
  const userId = req.cookies.userId;
  if (!userId) {
    console.log("No userId cookie, redirecting to auth");
    return res.redirect("/auth");
  }
  console.log("User authenticated, serving profile.html");
  res.sendFile(path.join(__dirname, "src", "profile.html"));
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
  console.log("GET /api/painting - Fetching paintings");
  try {
    const paintings = await db.read("painting", req.query);
    console.log("Found paintings:", paintings.length);

    // Если это запрос для select, возвращаем options
    if (req.headers["hx-target"] === "painting-select") {
      console.log("Returning select options");
      let html = '<option value="">Выберите картину</option>';
      for (const painting of paintings) {
        html += `<option value="${painting.id_p}">${painting.title}</option>`;
      }
      res.set("Content-Type", "text/html");
      return res.send(html);
    }

    // Иначе возвращаем карточки картин
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
  console.log("GET /api/reviews - Fetching reviews");
  try {
    const reviews = await db.read(
      "review",
      req.query,
      "review.*, users.first_name, users.last_name",
      "LEFT JOIN users ON review.id_u = users.id_u"
    );
    console.log("Found reviews:", reviews.length);

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

// Auth routes
app.post("/api/auth/register", async (req, res) => {
  console.log("POST /api/auth/register - Attempting registration");
  try {
    const { first_name, last_name, email, password } = req.body;
    console.log("Registration data:", { first_name, last_name, email });

    // Проверяем, существует ли пользователь
    const existingUser = await db.read("users", { email });
    if (existingUser.length > 0) {
      console.log("User already exists:", email);
      return res
        .status(400)
        .send(
          '<div class="error">Пользователь с таким email уже существует</div>'
        );
    }

    // Создаем нового пользователя
    const userId = await db.create("users", {
      first_name,
      last_name,
      email,
      password,
    });
    console.log("User created successfully, id:", userId);

    res.send(
      '<div class="success">Регистрация успешна! Теперь вы можете войти.</div>'
    );
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).send('<div class="error">Ошибка при регистрации</div>');
  }
});

app.post("/api/auth/login", async (req, res) => {
  console.log("POST /api/auth/login - Attempting login");
  try {
    const { email, password } = req.body;
    console.log("Login attempt for:", email);

    // Ищем пользователя
    const users = await db.read("users", { email, password });
    console.log(
      "Login query result:",
      users.length > 0 ? "User found" : "User not found"
    );

    if (users.length === 0) {
      return res
        .status(400)
        .send('<div class="error">Неверный email или пароль</div>');
    }

    // Устанавливаем куки с ID пользователя
    res.cookie("userId", users[0].id_u, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 часа
    });
    console.log("Login successful, cookie set for user:", users[0].id_u);

    res.send('<div class="success">Вход выполнен успешно!</div>');
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send('<div class="error">Ошибка при входе</div>');
  }
});

// Auth check endpoint
app.get("/api/auth/check", (req, res) => {
  console.log("GET /api/auth/check - Checking auth status");
  const isAuthenticated = !!req.cookies.userId;
  console.log("Auth status:", isAuthenticated);
  res.json({ authenticated: isAuthenticated });
});

// Review routes
app.post("/api/reviews", async (req, res) => {
  console.log("POST /api/reviews - Attempting to create review");
  try {
    const userId = req.cookies.userId;
    console.log("Review request from user:", userId);

    if (!userId) {
      console.log("No userId cookie, unauthorized");
      return res
        .status(401)
        .send('<div class="error">Необходимо авторизоваться</div>');
    }

    const { painting_id, comment } = req.body;
    console.log("Review data:", { painting_id, comment });

    if (!painting_id || !comment) {
      console.log("Missing required fields");
      return res
        .status(400)
        .send('<div class="error">Все поля обязательны</div>');
    }

    const reviewId = await db.create("review", {
      id_p: painting_id,
      id_u: userId,
      comment,
      review_date: new Date().toISOString(),
    });
    console.log("Review created successfully, id:", reviewId);

    res.send('<div class="success">Отзыв успешно добавлен!</div>');
  } catch (err) {
    console.error("Error creating review:", err);
    res
      .status(500)
      .send('<div class="error">Ошибка при добавлении отзыва</div>');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

function onRegisterSuccess(event) {
  if (
    event.detail.xhr &&
    event.detail.xhr.responseText.includes("Регистрация успешна")
  ) {
    // Переключаем на форму входа
    toggleForms();
    // Очищаем поля регистрации
    document.getElementById("register-first-name").value = "";
    document.getElementById("register-last-name").value = "";
    document.getElementById("register-email").value = "";
    document.getElementById("register-password").value = "";
    document.getElementById("register-phone").value = "";
    // Показываем сообщение
    document.getElementById("auth-message").className = "success";
  }
}
